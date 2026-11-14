// Sin `import "server-only"`: lo consume el worker de Node (scripts/zoom-archivos-worker.ts), no Next.
import { createHash } from "node:crypto";
import { crearGoogleDriveAuthClient } from "../integrations/google/auth";
import { verificarEscrituraCarpetaDrive } from "../integrations/google/drive";
import { crearProveedorTokenZoom } from "../integrations/zoom/zoom-client";
import { descifrarConfiguracion, cifrarConfiguracion } from "../lib/config/encryption";
import { db } from "../lib/db";
import { procesarWebhooksZoom } from "./zoom-webhook-worker";
import { notificarGrabacionesZoom } from "./zoom-grabaciones-correo.server";
import { enviarCorreoConfigurado } from "../modules/configuracion/correo.service";
import { crearCompartirArchivoZoom } from "../modules/archivos/infrastructure/google/google-zoom-archivo-sharing.adapter";
import { obtenerCredencialPrincipalGoogleWorkspace } from "../modules/configuracion/google-workspace.service";
import { obtenerCredencialesZoom } from "../modules/configuracion/zoom-config.service";
import {
  barrerAnfitrionesZoomUseCase,
  diasDeBarridoZoom,
  moverCarpetasVinculadasZoomUseCase,
  sincronizarAsistenciaPendienteZoomUseCase,
  sincronizarAsistenciaZoomUseCase,
  procesarPaginaRecuperacionZoom,
  comprobarSaludWorkerZoom,
  inventariarOcurrenciasVencidasZoomUseCase,
  resolverCarpetaDestinoZoom,
  transferirArchivoZoomUseCase,
  type AnfitrionInventarioZoom,
  type SaludWorkerZoom
} from "../modules/archivos/application";
import {
  FALLOS_CONSECUTIVOS_PARA_REVISION_ZOOM,
  leerConfiguracionZoomArchivos,
  type LeaseArchivoZoom
} from "../modules/archivos/domain";
import {
  GoogleDriveArchivoStorageAdapter,
  crearPrismaZoomArchivoRepositoryAdapter,
  crearPrismaZoomBarridoRepositoryAdapter,
  crearPrismaZoomCarpetasRepositoryAdapter,
  crearPrismaAsistenciaPendienteAdapter,
  crearPrismaAsistenciaZoomRepositoryAdapter,
  crearPrismaSincronizacionAsistenciaZoomAdapter,
  crearZoomAsistenciaProviderAdapter,
  crearZoomOrigenAdapter
} from "../modules/archivos/infrastructure";

const TIPOS_ZOOM = ["ZOOM", "ZOOM_HISTORICO"] as const;
const LOTE_INVENTARIO = 50;
const LOTE_CARPETAS = 25;
const LOTE_ASISTENCIA = 20;
/** Páginas de recuperación histórica por ciclo de mantenimiento: acota el tiempo sin frenar el resto. */
const PAGINAS_RECUPERACION_POR_CICLO = 20;
/** Mínimo de días del barrido periódico; en la práctica cubre todo desde INICIO_HISTORICO_ZOOM. */
const DIAS_BARRIDO_RECIENTE = 3;
/** El barrido histórico cubre fechas anteriores a la existencia del servicio; Zoom aplica su propia retención. */
const INICIO_HISTORICO_ZOOM = "2026-11-01";

/** SHA-256 completo: las marcas de origen en Drive exigen 64 caracteres hexadecimales. */
const hash = (texto: string): string => createHash("sha256").update(texto).digest("hex");

export type WorkerZoomArchivos = Readonly<{
  config: ReturnType<typeof leerConfiguracionZoomArchivos>;
  salud: SaludWorkerZoom;
  reclamarArchivo: (ahora: Date, duracionMs: number) => Promise<LeaseArchivoZoom | null>;
  transferir: (lease: LeaseArchivoZoom, signal: AbortSignal) => Promise<unknown>;
  inventariarVencidas: () => Promise<unknown>;
  barrerRecientes: () => Promise<unknown>;
  /** Continúa las recuperaciones históricas encoladas (una página a la vez). */
  procesarRecuperaciones: () => Promise<unknown>;
  /** Mueve a la raíz de vinculados las carpetas de ocurrencias ya vinculadas a un encuentro. */
  moverCarpetasVinculadas: () => Promise<unknown>;
  /** Sincroniza la asistencia (reporte de participantes) de las ocurrencias que aún no la tienen. */
  sincronizarAsistenciaPendiente: () => Promise<unknown>;
  procesarWebhooks: () => Promise<unknown>;
  notificarGrabaciones: () => Promise<unknown>;
}>;

/** Anfitriones configurados, activos o no: salir del grupo no oculta el histórico ya conocido. */
export async function listarAnfitriones(cuentaZoomId: string): Promise<readonly AnfitrionInventarioZoom[]> {
  const cuentas = await db.cuentaProveedor.findMany({
    where: { proveedor: { tipo: { in: [...TIPOS_ZOOM] } }, externalAccountId: { not: null } },
    select: { id: true, externalAccountId: true },
    orderBy: { id: "asc" }
  });
  return cuentas.flatMap((c) =>
    c.externalAccountId
      ? [{ cuentaZoomId, anfitrionZoomId: c.externalAccountId, cuentaProveedorId: c.id }]
      : []
  );
}

export async function crearWorkerZoomArchivos(
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<WorkerZoomArchivos> {
  const config = leerConfiguracionZoomArchivos(env);
  const repo = crearPrismaZoomArchivoRepositoryAdapter({ db, hash });

  const zoom = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  const workspace = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, {
    requireActiva: true
  });

  const driveAuth = workspace
    ? crearGoogleDriveAuthClient({
        serviceAccountEmail: workspace.serviceAccountEmail,
        privateKey: workspace.privateKey,
        subject: workspace.serviceAccountSubject ?? undefined
      })
    : null;

  const salud = await comprobarSaludWorkerZoom({
    workspace,
    zoomDisponible: zoom.disponible,
    driveHistoricoId: config.driveHistoricoId,
    verificarEscritura: (carpetaId) =>
      driveAuth ? verificarEscrituraCarpetaDrive(driveAuth, carpetaId) : Promise.resolve(false)
  });
  if (!salud.ok || !zoom.disponible || !driveAuth || !workspace) {
    return {
      config,
      salud,
      reclamarArchivo: async () => null,
      transferir: async () => undefined,
      inventariarVencidas: async () => undefined,
      barrerRecientes: async () => undefined,
      procesarRecuperaciones: async () => undefined,
      moverCarpetasVinculadas: async () => undefined,
      sincronizarAsistenciaPendiente: async () => undefined,
      procesarWebhooks: async () => undefined,
      notificarGrabaciones: async () => undefined
    };
  }

  const cuentaZoomId = zoom.accountId;
  const auth = crearProveedorTokenZoom({
    accountId: zoom.accountId,
    clientId: zoom.clientId,
    clientSecret: zoom.clientSecret
  });
  const origen = crearZoomOrigenAdapter({ auth, cuentaZoomId, hash });
  const storage = new GoogleDriveArchivoStorageAdapter({
    auth: driveAuth,
    cifrar: cifrarConfiguracion,
    descifrar: descifrarConfiguracion
  });
  const repoBarridos = crearPrismaZoomBarridoRepositoryAdapter({
    db,
    cifrar: cifrarConfiguracion,
    descifrar: descifrarConfiguracion
  });
  const raices = { raizVinculados: workspace.driveDestinationId, raizHistorico: config.driveHistoricoId };

  // El barrido periódico cubre todo lo que Zoom devuelva desde INICIO_HISTORICO_ZOOM. Encolar una importación durable única
  // permite recuperar el historial por páginas y ventanas sin repetirlo en cada ciclo.
  const anfitrionesIniciales = await listarAnfitriones(cuentaZoomId);
  if (anfitrionesIniciales.length > 0) {
    const fechaInicio = new Date(`${INICIO_HISTORICO_ZOOM}T00:00:00.000Z`);
    const importacionExistente = await db.barridoArchivoZoom.findFirst({
      where: {
        cuentaZoomId,
        desde: fechaInicio,
        estado: { in: ["PENDIENTE", "EN_CURSO", "COMPLETADO", "ERROR_REINTENTABLE", "REQUIERE_REVISION"] }
      },
      select: { id: true }
    });
    if (!importacionExistente) {
      const hasta = new Date().toISOString().slice(0, 10);
      await repoBarridos.crear({
        cuentaZoomId,
        anfitriones: anfitrionesIniciales.map(({ anfitrionZoomId, cuentaProveedorId }) => ({
          anfitrionZoomId,
          cuentaProveedorId
        })),
        desde: INICIO_HISTORICO_ZOOM,
        hasta,
        solicitanteId: null
      });
    }
  }

  return {
    config,
    salud,
    procesarWebhooks: () => procesarWebhooksZoom(cuentaZoomId),
    notificarGrabaciones: () =>
      notificarGrabacionesZoom(
        {
          db,
          compartirArchivo: crearCompartirArchivoZoom(driveAuth),
          enviarCorreo: (input) => enviarCorreoConfigurado(db, input)
        },
        cuentaZoomId
      ),
    reclamarArchivo: (ahora, duracionMs) => repo.reclamarArchivo(ahora, duracionMs),
    transferir: (lease, signal) =>
      transferirArchivoZoomUseCase(repo, origen, storage, lease, signal, {
        ahora: () => new Date(),
        limites: config.limites,
        aleatorio: Math.random,
        leaseMs: config.leaseMs,
        heartbeatMs: config.heartbeatMs,
        margenLeaseMs: config.margenLeaseMs,
        bloqueBytes: config.bloqueBytes,
        resolverCarpeta: (archivo) => resolverCarpetaDestinoZoom(storage, hash, archivo, raices)
      }),
    inventariarVencidas: () =>
      inventariarOcurrenciasVencidasZoomUseCase(repo, origen, {
        ahora: new Date(),
        limite: LOTE_INVENTARIO,
        corteDias: config.corteDias
      }),
    barrerRecientes: async () =>
      barrerAnfitrionesZoomUseCase(repo, origen, {
        anfitriones: await listarAnfitriones(cuentaZoomId),
        ahora: new Date(),
        diasAtras: diasDeBarridoZoom(new Date(), INICIO_HISTORICO_ZOOM, DIAS_BARRIDO_RECIENTE),
        corteDias: config.corteDias
      }),
    sincronizarAsistenciaPendiente: () => {
      const asistencia = {
        sync: crearPrismaSincronizacionAsistenciaZoomAdapter({ db }),
        repo: crearPrismaAsistenciaZoomRepositoryAdapter({ db }),
        provider: crearZoomAsistenciaProviderAdapter({ auth, hash })
      };
      return sincronizarAsistenciaPendienteZoomUseCase(
        {
          repo: crearPrismaAsistenciaPendienteAdapter({ db }),
          sincronizar: (id) => sincronizarAsistenciaZoomUseCase(asistencia, id),
          ahora: () => new Date()
        },
        { limite: LOTE_ASISTENCIA }
      );
    },
    moverCarpetasVinculadas: () =>
      moverCarpetasVinculadasZoomUseCase(
        {
          repo: crearPrismaZoomCarpetasRepositoryAdapter({ db }),
          storage,
          hash,
          raizVinculados: raices.raizVinculados,
          ahora: () => new Date()
        },
        { limite: LOTE_CARPETAS }
      ),
    procesarRecuperaciones: async () => {
      let paginas = 0;
      let ocurrencias = 0;
      const detenidos: string[] = [];
      for (const barridoId of await repoBarridos.listarPendientes(new Date(), 5)) {
        while (paginas < PAGINAS_RECUPERACION_POR_CICLO) {
          const r = await procesarPaginaRecuperacionZoom(
            {
              repoBarridos,
              repoArchivos: repo,
              origen,
              cuentaZoomId,
              ahora: () => new Date(),
              leaseMs: config.leaseMs,
              corteDias: config.corteDias,
              aleatorio: Math.random,
              limiteIntentos: FALLOS_CONSECUTIVOS_PARA_REVISION_ZOOM
            },
            barridoId
          );
          paginas++;
          if (r.tipo === "AVANZO" || r.tipo === "COMPLETADO") {
            ocurrencias += r.ocurrencias;
          }
          if (r.tipo === "REQUIERE_REVISION") {
            detenidos.push(barridoId);
          }
          // Solo se sigue con la misma recuperación mientras avanza; un fallo espera su reintento.
          if (r.tipo !== "AVANZO") {
            break;
          }
        }
      }
      return { paginas, ocurrencias, requierenRevision: detenidos.length };
    }
  };
}
