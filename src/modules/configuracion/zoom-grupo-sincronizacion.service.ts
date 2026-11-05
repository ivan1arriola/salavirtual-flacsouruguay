import type { Prisma, PrismaClient } from "@prisma/client";
import { obtenerZoomAccessToken } from "@/src/integrations/zoom/zoom-client";
import {
  listarGruposZoomHttp,
  listarMiembrosGrupoZoomHttp,
  type GrupoZoom
} from "@/src/integrations/zoom/zoom-grupos-client";
import { filtroProveedorActivo } from "../reuniones/proveedor-reunion.domain";
import { bloquearReservaSalas } from "../reuniones/reserva-salas.adapter";
import { obtenerCredencialesZoom } from "./zoom-config.service";
import {
  planificarSincronizacionGrupoZoom,
  type MiembroGrupoZoom
} from "./zoom-grupo-sincronizacion.domain";

const CONFIGURACION_ID = "principal";
/** Un candado más viejo que esto se da por abandonado (proceso caído a mitad de la sincronización). */
const CANDADO_VENCE_MS = 10 * 60 * 1000;
const AVISO_SIN_GRUPO = "Elegí un grupo de Zoom para obtener las cuentas anfitrionas.";
const AVISO_EN_CURSO = "Ya hay una sincronización en curso.";
const ERROR_GENERICO = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo más tarde.";

export type ResultadoSincronizacionZoom = Readonly<{ ok: boolean; resumen: string }>;

/** Error cuyo mensaje está pensado para mostrarse tal cual como resultado de la sincronización. */
export class SincronizacionZoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SincronizacionZoomError";
  }
}

export class GrupoZoomVacioError extends SincronizacionZoomError {
  constructor(message = "El grupo de Zoom no tiene miembros.") {
    super(message);
    this.name = "GrupoZoomVacioError";
  }
}

type Descifrar = (cifrado: string) => string;
type GrupoElegido = Readonly<{ id: string; nombre: string | null }>;

async function obtenerTokenZoom(db: PrismaClient, descifrar: Descifrar): Promise<string> {
  const credenciales = await obtenerCredencialesZoom(db, descifrar);
  if (!credenciales.disponible) throw new Error(credenciales.error);
  return obtenerZoomAccessToken(credenciales);
}

export async function listarGruposZoom(db: PrismaClient, descifrar: Descifrar): Promise<readonly GrupoZoom[]> {
  return listarGruposZoomHttp(await obtenerTokenZoom(db, descifrar));
}

/** Guarda el grupo elegido; no toca credenciales ni el resultado de la última sincronización. */
export async function elegirGrupoZoom(
  db: PrismaClient,
  input: { grupoId: string; grupoNombre: string; actorId: string }
): Promise<void> {
  const { grupoId, grupoNombre, actorId } = input;
  await db.configuracionZoom.upsert({
    where: { id: CONFIGURACION_ID },
    create: { id: CONFIGURACION_ID, grupoId, grupoNombre, actualizadaPorId: actorId },
    update: { grupoId, grupoNombre, actualizadaPorId: actorId }
  });

  await db.auditoria.create({
    data: {
      actorUsuarioId: actorId,
      accion: "GRUPO_ZOOM_ELEGIDO",
      entidadTipo: "ConfiguracionZoom",
      entidadId: CONFIGURACION_ID,
      valorNuevo: { grupoId, grupoNombre }
    }
  });
}

/**
 * Hace que las cuentas Zoom (`CuentaProveedor` del proveedor ZOOM) reflejen los miembros
 * del grupo elegido. Lee Zoom antes de abrir la transacción: si Zoom falla, ninguna cuenta
 * cambia y el error queda como resultado de la última sincronización.
 */
export async function sincronizarCuentasZoomConGrupo(
  db: PrismaClient,
  descifrar: Descifrar,
  ahora: Date
): Promise<ResultadoSincronizacionZoom> {
  const config = await db.configuracionZoom.findUnique({
    where: { id: CONFIGURACION_ID },
    select: { grupoId: true, grupoNombre: true }
  });
  if (!config?.grupoId) return { ok: false, resumen: AVISO_SIN_GRUPO };

  const candado = await db.configuracionZoom.updateMany({
    where: {
      id: CONFIGURACION_ID,
      OR: [
        { sincronizandoDesdeAt: null },
        { sincronizandoDesdeAt: { lt: new Date(ahora.getTime() - CANDADO_VENCE_MS) } }
      ]
    },
    data: { sincronizandoDesdeAt: ahora }
  });
  if (candado.count === 0) return { ok: false, resumen: AVISO_EN_CURSO };

  try {
    // Lectura de Zoom fuera de la transacción; sus errores (permisos, grupo borrado, red) se muestran tal cual.
    const token = await obtenerTokenZoom(db, descifrar);
    const miembros = await listarMiembrosGrupoZoomHttp(token, config.grupoId);
    // Con cero miembros el plan desactivaría todas las cuentas: se rechaza antes de tocar la base.
    if (miembros.length === 0) throw new GrupoZoomVacioError();
    const resumen = await aplicarSincronizacion(db, { id: config.grupoId, nombre: config.grupoNombre }, miembros, ahora)
      .catch((error: unknown) => {
        if (error instanceof SincronizacionZoomError) throw error;
        console.error("[zoom] Falló la sincronización de cuentas con el grupo de Zoom", error);
        throw new SincronizacionZoomError(ERROR_GENERICO);
      });
    return { ok: true, resumen };
  } catch (error) {
    const resumen = error instanceof Error && error.message ? error.message : ERROR_GENERICO;
    await db.configuracionZoom.update({
      where: { id: CONFIGURACION_ID },
      data: { ultimaSincronizacionAt: ahora, ultimaSincronizacionResultado: resumen }
    });
    return { ok: false, resumen };
  } finally {
    // Solo libera su propio candado: si venció y lo tomó otra sincronización, no se lo quita.
    await db.configuracionZoom.updateMany({
      where: { id: CONFIGURACION_ID, sincronizandoDesdeAt: ahora },
      data: { sincronizandoDesdeAt: null }
    });
  }
}

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function datosDelMiembro(miembro: MiembroGrupoZoom) {
  return {
    nombre: miembro.nombre,
    emailOrganizador: normalizarEmail(miembro.email),
    externalAccountId: miembro.id,
    tieneLicencia: miembro.licenciado,
    origenGrupoZoom: true
  };
}

/**
 * Reuniones futuras por cuenta en una sola consulta: encuentros programados que todavía no
 * terminaron y cuyo evento Zoom es el vigente (el mismo criterio que usa la agenda).
 */
async function contarReunionesFuturas(
  tx: Prisma.TransactionClient,
  proveedorId: string,
  ahora: Date
): Promise<Record<string, number>> {
  const grupos = await tx.eventoProveedor.groupBy({
    by: ["cuentaProveedorId"],
    where: {
      proveedorId,
      cuentaProveedorId: { not: null },
      instancia: {
        estado: "PROGRAMADA",
        finProgramadoAt: { gt: ahora },
        AND: [filtroProveedorActivo("ZOOM") as Prisma.InstanciaSalaWhereInput]
      }
    },
    _count: { _all: true }
  });
  return Object.fromEntries(
    grupos.flatMap(({ cuentaProveedorId, _count }) => (cuentaProveedorId ? [[cuentaProveedorId, _count._all]] : []))
  );
}

async function aplicarSincronizacion(
  db: PrismaClient,
  grupo: GrupoElegido,
  miembros: readonly MiembroGrupoZoom[],
  ahora: Date
): Promise<string> {
  return db.$transaction(async (tx) => {
    const proveedor = await tx.proveedorReunion.findUnique({ where: { tipo: "ZOOM" }, select: { id: true } });
    if (!proveedor) throw new SincronizacionZoomError("El proveedor Zoom no está configurado.");
    // Mismo candado que la asignación de cuentas: ninguna reunión nueva cae en una cuenta
    // entre que se cuentan sus reuniones futuras y se decide desactivarla.
    await bloquearReservaSalas(tx, proveedor.id);

    const cuentas = await tx.cuentaProveedor.findMany({
      where: { proveedorId: proveedor.id },
      orderBy: [{ prioridad: "asc" }, { id: "asc" }],
      select: { id: true, emailOrganizador: true, externalAccountId: true, activa: true, fueraDelGrupoAt: true, prioridad: true }
    });
    const reunionesFuturas = await contarReunionesFuturas(tx, proveedor.id, ahora);
    const plan = planificarSincronizacionGrupoZoom(miembros, cuentas, reunionesFuturas);
    const cuentaPorId = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));

    for (const { miembro, prioridad } of plan.crear) {
      await tx.cuentaProveedor.create({
        data: { ...datosDelMiembro(miembro), proveedorId: proveedor.id, prioridad, limiteConcurrente: 1, activa: true }
      });
    }
    for (const { cuentaId, miembro, reactivar } of plan.actualizar) {
      await tx.cuentaProveedor.update({
        where: { id: cuentaId },
        data: { ...datosDelMiembro(miembro), fueraDelGrupoAt: null, ...(reactivar ? { activa: true } : {}) }
      });
    }
    // Una cuenta que ya estaba fuera del grupo conserva la fecha en que salió.
    for (const cuentaId of plan.desactivar) {
      await tx.cuentaProveedor.update({
        where: { id: cuentaId },
        data: { activa: false, fueraDelGrupoAt: cuentaPorId.get(cuentaId)?.fueraDelGrupoAt ?? ahora }
      });
    }
    for (const { cuentaId } of plan.marcarFuera) {
      if (cuentaPorId.get(cuentaId)?.fueraDelGrupoAt) continue;
      await tx.cuentaProveedor.update({ where: { id: cuentaId }, data: { fueraDelGrupoAt: ahora } });
    }

    await tx.auditoria.create({
      data: {
        actorUsuarioId: null,
        accion: "CUENTAS_ZOOM_SINCRONIZADAS",
        entidadTipo: "ConfiguracionZoom",
        entidadId: CONFIGURACION_ID,
        valorNuevo: {
          grupoId: grupo.id,
          grupoNombre: grupo.nombre,
          resumen: plan.resumen,
          creadas: plan.crear.map(({ miembro }) => normalizarEmail(miembro.email)),
          actualizadas: plan.actualizar.map(({ cuentaId, reactivar }) => ({ cuentaId, reactivar })),
          desactivadas: [...plan.desactivar],
          fueraDelGrupo: plan.marcarFuera.map(({ cuentaId, reunionesFuturas }) => ({ cuentaId, reunionesFuturas }))
        }
      }
    });
    await tx.configuracionZoom.update({
      where: { id: CONFIGURACION_ID },
      data: { ultimaSincronizacionAt: ahora, ultimaSincronizacionResultado: plan.resumen }
    });
    return plan.resumen;
  }, { maxWait: 10_000, timeout: 30_000 });
}
