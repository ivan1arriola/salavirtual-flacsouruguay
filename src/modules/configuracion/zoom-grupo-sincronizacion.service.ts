import { createHash } from "node:crypto";
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
  avisoSincronizacionMasiva,
  evaluarRiesgoSincronizacion,
  planificarSincronizacionGrupoZoom,
  type MiembroGrupoZoom,
  type PlanSincronizacionZoom
} from "./zoom-grupo-sincronizacion.domain";

const CONFIGURACION_ID = "principal";
/** Un candado más viejo que esto se da por abandonado (proceso caído a mitad de la sincronización). */
const CANDADO_VENCE_MS = 10 * 60 * 1000;
const AVISO_SIN_GRUPO = "Elegí un grupo de Zoom para obtener las cuentas anfitrionas.";
const AVISO_EN_CURSO = "Ya hay una sincronización en curso.";
const PEDIDO_CONFIRMACION = "Revisá la vista previa y confirmá para continuar.";
const ERROR_GENERICO = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo más tarde.";

export type ResultadoSincronizacionZoom = Readonly<{ ok: boolean; resumen: string }>;

export type OpcionesSincronizacionZoom = Readonly<{
  /** Quien pidió la sincronización (botón); `null` para la tarea periódica. */
  actorId?: string | null;
  /** Necesario para aplicar una sincronización masiva (ver `evaluarRiesgoSincronizacion`). */
  confirmar?: boolean;
  /** Huella de la vista previa que el administrador confirmó. */
  revision?: string;
}>;

/** Lo que cambiaría una sincronización, sin aplicarla. Las cuentas se identifican por correo. */
export type VistaPreviaSincronizacionZoom = Readonly<{
  ok: boolean;
  resumen: string;
  masivo: boolean;
  avisoMasivo: string | null;
  revision: string | null;
  crear: readonly string[];
  reactivar: readonly string[];
  desactivar: readonly string[];
  marcarFuera: readonly Readonly<{ email: string; reunionesFuturas: number }>[];
  sinLicencia: readonly string[];
  pierdenLicencia: readonly string[];
}>;

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

/**
 * Guarda el grupo elegido; no toca credenciales. Si el grupo cambia, borra el resultado de la
 * última sincronización, que describía al grupo anterior.
 */
export async function elegirGrupoZoom(
  db: PrismaClient,
  input: { grupoId: string; grupoNombre: string; actorId: string }
): Promise<void> {
  const { grupoId, grupoNombre, actorId } = input;
  const actual = await db.configuracionZoom.findUnique({ where: { id: CONFIGURACION_ID }, select: { grupoId: true } });
  const sinResultadoAnterior = actual && actual.grupoId !== grupoId
    ? { ultimaSincronizacionAt: null, ultimaSincronizacionResultado: null }
    : {};
  await db.configuracionZoom.upsert({
    where: { id: CONFIGURACION_ID },
    create: { id: CONFIGURACION_ID, grupoId, grupoNombre, actualizadaPorId: actorId },
    update: { grupoId, grupoNombre, actualizadaPorId: actorId, ...sinResultadoAnterior }
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
 * Lo que haría `sincronizarCuentasZoomConGrupo` con el grupo tal como está ahora en Zoom, sin
 * escribir nada ni tomar el candado. Los avisos y errores vuelven en `resumen` con `ok: false`
 * y no se guardan como resultado de la última sincronización.
 */
export async function previsualizarSincronizacionConGrupo(
  db: PrismaClient,
  descifrar: Descifrar,
  ahora: Date
): Promise<VistaPreviaSincronizacionZoom> {
  const grupo = await leerGrupoElegido(db);
  if (!grupo) return vistaPreviaFallida(AVISO_SIN_GRUPO);

  try {
    const miembros = await leerMiembrosDelGrupo(db, descifrar, grupo.id);
    const lectura = await buscarProveedorZoom(db)
      .then((proveedorId) => planificarConLaBase(db, proveedorId, miembros, ahora))
      .catch(protegerErrorDeBase("[zoom] Falló la vista previa de la sincronización con el grupo de Zoom"));
    return describirPlan(lectura, grupo.id);
  } catch (error) {
    return vistaPreviaFallida(mensajeDeError(error));
  }
}

/**
 * Hace que las cuentas Zoom (`CuentaProveedor` del proveedor ZOOM) reflejen los miembros
 * del grupo elegido. Lee Zoom antes de abrir la transacción: si Zoom falla, ninguna cuenta
 * cambia y el error queda como resultado de la última sincronización. Una sincronización
 * masiva sin `confirmar` no escribe nada y conserva el resultado anterior.
 */
export async function sincronizarCuentasZoomConGrupo(
  db: PrismaClient,
  descifrar: Descifrar,
  ahora: Date,
  opciones: OpcionesSincronizacionZoom = {}
): Promise<ResultadoSincronizacionZoom> {
  const grupo = await leerGrupoElegido(db);
  if (!grupo) return { ok: false, resumen: AVISO_SIN_GRUPO };

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
    const miembros = await leerMiembrosDelGrupo(db, descifrar, grupo.id);
    return await aplicarSincronizacion(db, grupo, miembros, ahora, opciones)
      .catch(protegerErrorDeBase("[zoom] Falló la sincronización de cuentas con el grupo de Zoom"));
  } catch (error) {
    const resumen = mensajeDeError(error);
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

async function leerGrupoElegido(db: PrismaClient): Promise<GrupoElegido | null> {
  const config = await db.configuracionZoom.findUnique({
    where: { id: CONFIGURACION_ID },
    select: { grupoId: true, grupoNombre: true }
  });
  return config?.grupoId ? { id: config.grupoId, nombre: config.grupoNombre } : null;
}

/**
 * Miembros del grupo, leídos de Zoom fuera de toda transacción; sus errores (permisos, grupo
 * borrado, red) se muestran tal cual. Con cero miembros el plan desactivaría todas las cuentas:
 * se rechaza antes de tocar la base.
 */
async function leerMiembrosDelGrupo(
  db: PrismaClient,
  descifrar: Descifrar,
  grupoId: string
): Promise<readonly MiembroGrupoZoom[]> {
  const miembros = await listarMiembrosGrupoZoomHttp(await obtenerTokenZoom(db, descifrar), grupoId);
  if (miembros.length === 0) throw new GrupoZoomVacioError();
  return miembros;
}

/** Los errores propios se muestran tal cual; los demás (base de datos) se registran y se reemplazan por un aviso legible. */
function protegerErrorDeBase(contexto: string) {
  return (error: unknown): never => {
    if (error instanceof SincronizacionZoomError) throw error;
    console.error(contexto, error);
    throw new SincronizacionZoomError(ERROR_GENERICO);
  };
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : ERROR_GENERICO;
}

function vistaPreviaFallida(resumen: string): VistaPreviaSincronizacionZoom {
  return {
    ok: false,
    resumen,
    masivo: false,
    avisoMasivo: null,
    revision: null,
    crear: [],
    reactivar: [],
    desactivar: [],
    marcarFuera: [],
    sinLicencia: [],
    pierdenLicencia: []
  };
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
 * Reuniones pendientes por cuenta Zoom en una sola consulta: encuentros programados que todavía no
 * terminaron o en curso, cuyo evento Zoom es el vigente.
 * Sin `proveedorId` (fuera de la sincronización) se acota al proveedor Zoom por su tipo.
 */
export async function contarReunionesFuturasZoom(
  db: Pick<Prisma.TransactionClient, "eventoProveedor">,
  ahora: Date,
  proveedorId?: string
): Promise<Record<string, number>> {
  const grupos = await db.eventoProveedor.groupBy({
    by: ["cuentaProveedorId"],
    where: {
      ...(proveedorId ? { proveedorId } : { proveedor: { tipo: "ZOOM" } }),
      cuentaProveedorId: { not: null },
      instancia: {
        OR: [
          { estado: "PROGRAMADA", finProgramadoAt: { gt: ahora } },
          { estado: "EN_CURSO" }
        ],
        AND: [filtroProveedorActivo("ZOOM") as Prisma.InstanciaSalaWhereInput]
      }
    },
    _count: { _all: true }
  });
  return Object.fromEntries(
    grupos.flatMap(({ cuentaProveedorId, _count }) => (cuentaProveedorId ? [[cuentaProveedorId, _count._all]] : []))
  );
}

async function buscarProveedorZoom(cliente: Pick<Prisma.TransactionClient, "proveedorReunion">): Promise<string> {
  const proveedor = await cliente.proveedorReunion.findUnique({ where: { tipo: "ZOOM" }, select: { id: true } });
  if (!proveedor) throw new SincronizacionZoomError("El proveedor Zoom no está configurado.");
  return proveedor.id;
}

/** Lee las cuentas Zoom y sus reuniones futuras y arma el plan: lo comparten la sincronización y la vista previa. */
async function planificarConLaBase(
  cliente: Pick<Prisma.TransactionClient, "cuentaProveedor" | "eventoProveedor">,
  proveedorId: string,
  miembros: readonly MiembroGrupoZoom[],
  ahora: Date
) {
  const cuentas = await cliente.cuentaProveedor.findMany({
    where: { proveedorId },
    orderBy: [{ prioridad: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nombre: true,
      emailOrganizador: true,
      externalAccountId: true,
      activa: true,
      tieneLicencia: true,
      fueraDelGrupoAt: true,
      prioridad: true
    }
  });
  const reunionesFuturas = await contarReunionesFuturasZoom(cliente, ahora, proveedorId);
  const plan = planificarSincronizacionGrupoZoom(miembros, cuentas, reunionesFuturas);
  return { cuentas, plan, riesgo: evaluarRiesgoSincronizacion(plan, cuentas) };
}

function revisionDelPlan(grupoId: string, plan: PlanSincronizacionZoom): string {
  const ordenar = <T>(items: readonly T[]) => items.map((item) => JSON.stringify(item)).sort();
  const contenido = JSON.stringify({
    grupoId,
    crear: ordenar(plan.crear),
    actualizar: ordenar(plan.actualizar),
    desactivar: [...plan.desactivar].sort(),
    marcarFuera: ordenar(plan.marcarFuera),
    sinLicencia: ordenar(plan.sinLicencia),
    pierdenLicencia: ordenar(plan.pierdenLicencia)
  });
  return createHash("sha256").update(contenido).digest("hex");
}

function describirPlan({ cuentas, plan, riesgo }: Awaited<ReturnType<typeof planificarConLaBase>>, grupoId: string): VistaPreviaSincronizacionZoom {
  const cuentaPorId = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
  const identificar = (cuentaId: string) => {
    const cuenta = cuentaPorId.get(cuentaId);
    return cuenta?.emailOrganizador ? normalizarEmail(cuenta.emailOrganizador) : cuenta?.nombre ?? cuentaId;
  };
  return {
    ok: true,
    resumen: plan.resumen,
    masivo: riesgo.masivo,
    avisoMasivo: riesgo.masivo ? avisoSincronizacionMasiva(riesgo) : null,
    revision: revisionDelPlan(grupoId, plan),
    crear: plan.crear.map(({ miembro }) => normalizarEmail(miembro.email)),
    reactivar: plan.actualizar.filter(({ reactivar }) => reactivar).map(({ miembro }) => normalizarEmail(miembro.email)),
    desactivar: plan.desactivar.map(identificar),
    marcarFuera: plan.marcarFuera.map(({ cuentaId, reunionesFuturas }) => ({ email: identificar(cuentaId), reunionesFuturas })),
    sinLicencia: plan.sinLicencia.map(({ email }) => normalizarEmail(email)),
    pierdenLicencia: plan.pierdenLicencia.map(({ miembro }) => normalizarEmail(miembro.email))
  };
}

async function aplicarSincronizacion(
  db: PrismaClient,
  grupo: GrupoElegido,
  miembros: readonly MiembroGrupoZoom[],
  ahora: Date,
  opciones: OpcionesSincronizacionZoom
): Promise<ResultadoSincronizacionZoom> {
  return db.$transaction(async (tx) => {
    const proveedorId = await buscarProveedorZoom(tx);
    // Mismo candado que la asignación de cuentas: ninguna reunión nueva cae en una cuenta
    // entre que se cuentan sus reuniones futuras y se decide desactivarla.
    await bloquearReservaSalas(tx, proveedorId);

    const { cuentas, plan, riesgo } = await planificarConLaBase(tx, proveedorId, miembros, ahora);
    if (opciones.actorId === null && plan.crear.length > 0) {
      const cantidad = plan.crear.length;
      return {
        ok: false,
        resumen: `Hay ${cantidad} ${cantidad === 1 ? "cuenta nueva" : "cuentas nuevas"} de Zoom. Revisá la vista previa y confirmá desde Configuración.`
      };
    }
    if (opciones.actorId === null && plan.pierdenLicencia.length > 0) {
      const cantidad = plan.pierdenLicencia.length;
      return {
        ok: false,
        resumen: `Hay ${cantidad} ${cantidad === 1 ? "sala que perdería" : "salas que perderían"} su licencia en Zoom. Revisá la vista previa y confirmá desde Configuración.`
      };
    }
    // Antes de escribir nada: una sincronización masiva solo se aplica confirmada después de la
    // vista previa. La tarea periódica nunca confirma, así que la rechaza.
    if (riesgo.masivo && opciones.confirmar !== true) {
      return { ok: false, resumen: `${avisoSincronizacionMasiva(riesgo)} ${PEDIDO_CONFIRMACION}` };
    }
    if ((opciones.revision !== undefined || riesgo.masivo) && opciones.revision !== revisionDelPlan(grupo.id, plan)) {
      return { ok: false, resumen: "El grupo de Zoom cambió desde la vista previa. Revisá los cambios de nuevo." };
    }
    const cuentaPorId = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));

    for (const { miembro, prioridad } of plan.crear) {
      await tx.cuentaProveedor.create({
        data: { ...datosDelMiembro(miembro), proveedorId, prioridad, limiteConcurrente: 1, activa: true }
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
        actorUsuarioId: opciones.actorId ?? null,
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
          fueraDelGrupo: plan.marcarFuera.map(({ cuentaId, reunionesFuturas }) => ({ cuentaId, reunionesFuturas })),
          sinLicencia: plan.sinLicencia.map(({ email }) => normalizarEmail(email)),
          pasanASinLicencia: plan.pierdenLicencia.map(({ cuentaId }) => cuentaId)
        }
      }
    });
    await tx.configuracionZoom.update({
      where: { id: CONFIGURACION_ID },
      data: { ultimaSincronizacionAt: ahora, ultimaSincronizacionResultado: plan.resumen }
    });
    return { ok: true, resumen: plan.resumen };
  }, { maxWait: 10_000, timeout: 30_000 });
}
