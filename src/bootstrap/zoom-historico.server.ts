// Sin `import "server-only"`: lo consumen las rutas de Next y el script de Node (scripts/recuperar-archivos-zoom.ts).
import { createHash } from "node:crypto";
import { crearProveedorTokenZoom } from "../integrations/zoom/zoom-client";
import { cifrarConfiguracion, descifrarConfiguracion } from "../lib/config/encryption";
import { db } from "../lib/db";
import { obtenerCredencialesZoom } from "../modules/configuracion/zoom-config.service";
import {
  consultarEstadoZoomArchivosUseCase,
  crearRecuperacionZoom,
  listarInventarioZoomUseCase,
  desvincularOcurrenciaZoom,
  vincularOcurrenciaZoom,
  type ActorRecuperacionZoom,
  type ResumenRecuperacion,
  type SolicitudRecuperacionZoom,
} from "../modules/archivos/application";
import type { BarridoZoom, EntradaInventarioZoom } from "../modules/archivos/ports";
import {
  crearPrismaZoomArchivoRepositoryAdapter,
  crearPrismaZoomBarridoRepositoryAdapter,
  crearPrismaZoomEstadoLecturaAdapter,
  crearPrismaZoomInventarioLecturaAdapter,
  crearZoomOrigenAdapter,
} from "../modules/archivos/infrastructure";
import { listarAnfitriones } from "./zoom-archivos.server";

const hash = (texto: string): string => createHash("sha256").update(texto).digest("hex");

export type ProgresoRecuperacionPublico = Readonly<{
  id: string;
  estado: BarridoZoom["estado"];
  desde: string;
  hasta: string;
  anfitriones: number;
  anfitrionActual: number;
  paginasProcesadas: number;
  ocurrenciasEncontradas: number;
  intentos: number;
  errorCodigo: string | null;
  completadoAt: Date | null;
}>;

/** Crea (o simula con `dryRun`) una recuperación histórica. No transfiere: eso lo hace el worker. */
export async function solicitarRecuperacionZoom(
  actor: ActorRecuperacionZoom,
  solicitud: SolicitudRecuperacionZoom,
): Promise<ResumenRecuperacion | { tipo: "ZOOM_NO_CONFIGURADO" }> {
  const zoom = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  if (!zoom.disponible) {
    return { tipo: "ZOOM_NO_CONFIGURADO" };
  }
  const auth = crearProveedorTokenZoom({
    accountId: zoom.accountId,
    clientId: zoom.clientId,
    clientSecret: zoom.clientSecret,
  });
  const origen = crearZoomOrigenAdapter({ auth, cuentaZoomId: zoom.accountId, hash });
  return crearRecuperacionZoom(
    {
      origen,
      repoBarridos: crearPrismaZoomBarridoRepositoryAdapter({
        db,
        cifrar: cifrarConfiguracion,
        descifrar: descifrarConfiguracion,
      }),
      cuentaZoomId: zoom.accountId,
      ahora: () => new Date(),
      anfitriones: () => listarAnfitriones(zoom.accountId),
    },
    actor,
    solicitud,
  );
}

/** Progreso de una recuperación; solo administración. Nunca incluye el cursor ni la lista de anfitriones. */
export async function consultarRecuperacionZoom(
  actor: Pick<ActorRecuperacionZoom, "rol">,
  barridoId: string,
): Promise<ProgresoRecuperacionPublico | "PROHIBIDO" | null> {
  if (actor.rol !== "ADMINISTRACION") {
    return "PROHIBIDO";
  }
  const repo = crearPrismaZoomBarridoRepositoryAdapter({
    db,
    cifrar: cifrarConfiguracion,
    descifrar: descifrarConfiguracion,
  });
  const b = await repo.obtener(barridoId);
  if (!b) {
    return null;
  }
  return {
    id: b.id,
    estado: b.estado,
    desde: b.desde,
    hasta: b.hasta,
    anfitriones: b.anfitriones.length,
    anfitrionActual: b.posicion.anfitrionIndice,
    paginasProcesadas: b.paginasProcesadas,
    ocurrenciasEncontradas: b.ocurrenciasEncontradas,
    intentos: b.intentos,
    errorCodigo: b.errorCodigo,
    completadoAt: b.completadoAt,
  };
}

export async function vincularOcurrenciaZoomAdmin(
  actor: ActorRecuperacionZoom,
  ocurrenciaId: string,
  eventoId: string,
) {
  return vincularOcurrenciaZoom(
    { repo: crearPrismaZoomArchivoRepositoryAdapter({ db, hash }) },
    actor,
    ocurrenciaId,
    eventoId,
  );
}

export async function desvincularOcurrenciaZoomAdmin(
  actor: ActorRecuperacionZoom,
  ocurrenciaId: string,
  eventoId: string,
) {
  return desvincularOcurrenciaZoom(
    { repo: crearPrismaZoomArchivoRepositoryAdapter({ db, hash }) },
    actor,
    ocurrenciaId,
    eventoId,
  );
}

/** Inventario de archivos Zoom para la biblioteca; el rol se verifica aquí, en el servidor. */
export async function listarInventarioZoomAdmin(
  actor: Readonly<{ id: string; rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO" }>,
  entrada: EntradaInventarioZoom,
) {
  return listarInventarioZoomUseCase(
    crearPrismaZoomInventarioLecturaAdapter({ db }),
    actor,
    entrada,
  );
}

/** Estado operativo de la conservación Zoom (cola, antigüedad, fallos de capacidad). Solo base de datos. */
export async function estadoZoomArchivos(ahora = new Date()) {
  const estado = await consultarEstadoZoomArchivosUseCase(
    crearPrismaZoomEstadoLecturaAdapter({ db }),
    ahora,
  );
  return { disponible: true as const, ...estado };
}

export async function reintentarArchivoZoomAdmin(actor: ActorRecuperacionZoom, archivoId: string) {
  const { reintentarArchivoZoomUseCase } =
    await import("../modules/archivos/application/reintentar-archivo-zoom.use-case");
  return reintentarArchivoZoomUseCase(
    crearPrismaZoomArchivoRepositoryAdapter({ db, hash }),
    actor,
    archivoId,
  );
}
export async function listarEncuentrosCandidatosZoomAdmin(
  actor: ActorRecuperacionZoom,
  ocurrenciaId: string,
) {
  const { listarEncuentrosCandidatosZoomUseCase } =
    await import("../modules/archivos/application/listar-encuentros-candidatos-zoom.use-case");
  const { crearPrismaZoomCandidatosLecturaAdapter } =
    await import("../modules/archivos/infrastructure/prisma/prisma-zoom-candidatos-lectura.adapter");
  return listarEncuentrosCandidatosZoomUseCase(
    crearPrismaZoomCandidatosLecturaAdapter(db),
    actor,
    ocurrenciaId,
  );
}
