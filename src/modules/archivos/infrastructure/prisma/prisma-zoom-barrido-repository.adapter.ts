import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AnfitrionBarridoZoom,
  BarridoZoom,
  BarridoZoomRepositoryPort,
  EstadoBarridoZoom
} from "../../ports";

export type PrismaZoomBarridoRepositoryDeps = Readonly<{
  db: PrismaClient;
  /** El token de página de Zoom se guarda cifrado en reposo. */
  cifrar: (texto: string) => string;
  descifrar: (texto: string) => string;
}>;

const aFecha = (s: string): Date => new Date(`${s}T00:00:00Z`);
const deFecha = (d: Date): string => d.toISOString().slice(0, 10);

type Fila = Prisma.BarridoArchivoZoomGetPayload<Record<string, never>>;

function anfitrionesDe(json: Prisma.JsonValue): readonly AnfitrionBarridoZoom[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    const o = x as { anfitrionZoomId?: unknown; cuentaProveedorId?: unknown } | null;
    return o && typeof o.anfitrionZoomId === "string"
      ? [{ anfitrionZoomId: o.anfitrionZoomId, cuentaProveedorId: typeof o.cuentaProveedorId === "string" ? o.cuentaProveedorId : null }]
      : [];
  });
}

export function crearPrismaZoomBarridoRepositoryAdapter(deps: PrismaZoomBarridoRepositoryDeps): BarridoZoomRepositoryPort {
  const { db } = deps;
  const aBarrido = (f: Fila): BarridoZoom => ({
    id: f.id,
    cuentaZoomId: f.cuentaZoomId,
    anfitriones: anfitrionesDe(f.anfitrionesSnapshot),
    desde: deLaFecha(f.desde),
    hasta: deLaFecha(f.hasta),
    posicion: {
      anfitrionIndice: f.anfitrionIndice,
      ventanaDesde: f.ventanaDesde ? deFecha(f.ventanaDesde) : null,
      cursor: f.nextPageTokenCifrado ? deps.descifrar(f.nextPageTokenCifrado) : null
    },
    estado: f.estado as EstadoBarridoZoom,
    paginasProcesadas: f.paginasProcesadas,
    ocurrenciasEncontradas: f.ocurrenciasEncontradas,
    intentos: f.intentos,
    errorCodigo: f.errorCodigo,
    completadoAt: f.completadoAt
  });
  function deLaFecha(d: Date): string {
    return deFecha(d);
  }

  return {
    async crear(n) {
      const fila = await db.barridoArchivoZoom.create({
        data: {
          cuentaZoomId: n.cuentaZoomId,
          anfitrionesSnapshot: n.anfitriones.map((a) => ({ anfitrionZoomId: a.anfitrionZoomId, cuentaProveedorId: a.cuentaProveedorId })),
          desde: aFecha(n.desde),
          hasta: aFecha(n.hasta),
          solicitanteId: n.solicitanteId
        },
        select: { id: true }
      });
      await db.auditoria.create({
        data: {
          actorUsuarioId: n.solicitanteId, accion: "ZOOM_RECUPERACION_CREADA",
          entidadTipo: "BarridoArchivoZoom", entidadId: fila.id,
          valorNuevo: { desde: n.desde, hasta: n.hasta, anfitriones: n.anfitriones.length }
        }
      });
      return fila;
    },

    async obtener(barridoId) {
      const fila = await db.barridoArchivoZoom.findUnique({ where: { id: barridoId } });
      return fila ? aBarrido(fila) : null;
    },

    async reclamar(barridoId, ahora, duracionMs) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.barridoArchivoZoom.updateMany({
          where: {
            id: barridoId,
            estado: { in: ["PENDIENTE", "EN_CURSO", "ERROR_REINTENTABLE"] },
            AND: [
              { OR: [{ proximoIntentoAt: null }, { proximoIntentoAt: { lte: ahora } }] },
              { OR: [{ leaseHasta: null }, { leaseHasta: { lt: ahora } }] }
            ]
          },
          data: { estado: "EN_CURSO", leaseVersion: { increment: 1 }, leaseHasta: new Date(ahora.getTime() + duracionMs) }
        });
        if (count === 0) return null;
        const fila = await tx.barridoArchivoZoom.findUniqueOrThrow({ where: { id: barridoId } });
        return {
          lease: { barridoId, version: fila.leaseVersion, venceAt: fila.leaseHasta! },
          barrido: aBarrido(fila)
        };
      });
    },

    async avanzar(lease, avance, ahora) {
      const termina = avance.siguiente === null;
      const { count } = await db.barridoArchivoZoom.updateMany({
        where: { id: lease.barridoId, leaseVersion: lease.version, estado: "EN_CURSO" },
        data: {
          ...(avance.siguiente
            ? {
                anfitrionIndice: avance.siguiente.anfitrionIndice,
                ventanaDesde: avance.siguiente.ventanaDesde ? aFecha(avance.siguiente.ventanaDesde) : null,
                nextPageTokenCifrado: avance.siguiente.cursor ? deps.cifrar(avance.siguiente.cursor) : null
              }
            : { nextPageTokenCifrado: null }),
          paginasProcesadas: { increment: 1 },
          ocurrenciasEncontradas: { increment: avance.ocurrencias },
          intentos: 0,
          proximoIntentoAt: null,
          leaseHasta: null,
          estado: termina ? "COMPLETADO" : "PENDIENTE",
          completadoAt: termina ? ahora : null,
          ...(avance.anfitrionOmitidoCodigo ? { errorCodigo: avance.anfitrionOmitidoCodigo } : {})
        }
      });
      return count === 1;
    },

    async registrarFallo(lease, fallo) {
      return db.$transaction(async (tx) => {
        const fila = await tx.barridoArchivoZoom.findFirst({
          where: { id: lease.barridoId, leaseVersion: lease.version, estado: "EN_CURSO" },
          select: { intentos: true }
        });
        if (!fila) return false;
        const intentos = fila.intentos + 1;
        const revision = fallo.tipo === "REVISION" || (fallo.limiteIntentos != null && intentos >= fallo.limiteIntentos);
        const { count } = await tx.barridoArchivoZoom.updateMany({
          where: { id: lease.barridoId, leaseVersion: lease.version, estado: "EN_CURSO" },
          data: {
            intentos,
            errorCodigo: fallo.codigo.slice(0, 120),
            estado: revision ? "REQUIERE_REVISION" : "ERROR_REINTENTABLE",
            proximoIntentoAt: revision ? null : fallo.proximoIntentoAt,
            leaseHasta: null,
            ...(fallo.reiniciarCursor ? { nextPageTokenCifrado: null } : {})
          }
        });
        return count === 1;
      });
    },

    async listarPendientes(ahora, limite) {
      const filas = await db.barridoArchivoZoom.findMany({
        where: {
          OR: [
            { estado: "PENDIENTE" },
            { estado: "ERROR_REINTENTABLE", OR: [{ proximoIntentoAt: null }, { proximoIntentoAt: { lte: ahora } }] },
            { estado: "EN_CURSO", OR: [{ leaseHasta: null }, { leaseHasta: { lt: ahora } }] }
          ]
        },
        orderBy: { createdAt: "asc" },
        take: limite,
        select: { id: true }
      });
      return filas.map((f) => f.id);
    }
  };
}
