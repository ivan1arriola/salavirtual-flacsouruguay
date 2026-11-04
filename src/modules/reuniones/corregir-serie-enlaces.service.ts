import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ForbiddenApiError, ValidationApiError } from "@/src/lib/http/api-error";
import { notificarCambioEnlaceSerie } from "./aviso-enlace-serie.service";
import { planificarCorreccionSerie, type PlanCorreccionSerie } from "./corregir-serie-enlaces.domain";
import { MARGEN_SEGURIDAD_HORAS_APLICAR, type DependenciasMigracionZoom } from "./migracion-zoom-aplicar.service";
import { esUrlZoom } from "./migracion-zoom-aviso-email.domain";
import { prepararCambioEnlaceZoomACalendar } from "./migracion-zoom-calendar.domain";
import type { ResumenAvisosMigracion } from "./migracion-zoom-avisos.service";
import { proveedorActivoDeInstancia } from "./proveedor-reunion.domain";
import { bloquearReservaSalas } from "./reserva-salas.adapter";
import { claveBloqueoSerieMigracion, filtroSerieDesdeClave } from "./serie-reunion.domain";
import { evaluarEnlacesDeSerie, type EncuentroEnlaceSerie } from "./series-enlaces-distintos.domain";

type Actor = Readonly<{ id: string; rol: string }>;

export const MAXIMO_LOTE_CORRECCION_SERIE = 5;
/** Convivencia: la reunión Zoom antigua sigue viva este tiempo por quien conserve su enlace en un correo. */
export const DIAS_CONVIVENCIA_REUNION_ANTIGUA = 7;
const RECLAMO_CREACION_TIMEOUT_MS = 5 * 60_000;

export type DependenciasCorreccionSerie = DependenciasMigracionZoom & Readonly<{
  zoom: Readonly<{
    /** Reunión del anfitrión que lleve la marca en su agenda (recupera una creada por un intento que murió). */
    buscarPorMarca: (hostEmail: string, marca: string) => Promise<Readonly<{ meetingId: string; joinUrl: string }> | null>;
    /** Crea la reunión recurrente (tipo 3) con un `join_url` estable. */
    crearRecurrente: (
      hostEmail: string,
      input: Readonly<{ topic: string; agenda: string }>,
    ) => Promise<Readonly<{ meetingId: string; joinUrl: string }>>;
    /** Elimina una reunión; una inexistente (404) no es un error. */
    eliminar: (meetingId: string) => Promise<void>;
  }>;
  /** Aviso por serie; por defecto el real. Se inyecta en las pruebas. */
  notificarCambioSerie?: typeof notificarCambioEnlaceSerie;
}>;

export type ResultadoCorreccionSerie = Readonly<{
  serieClave: string;
  resultado: "CORREGIDA" | "YA_UNIFICADA" | "OMITIDA" | "ERROR";
  etapa: "VALIDACION" | "ZOOM" | "CALENDAR" | "VINCULACION" | "AVISOS";
  mensaje?: string;
  reintentable: boolean;
  encuentros?: number;
  avisos?: ResumenAvisosMigracion;
}>;

class FalloEtapa extends Error {
  constructor(
    public readonly etapa: ResultadoCorreccionSerie["etapa"],
    message: string,
    public readonly reintentable = true,
    public readonly omitida = false,
  ) {
    super(message);
  }
}

const seleccionInstancia = {
  id: true,
  estado: true,
  inicioProgramadoAt: true,
  finProgramadoAt: true,
  proveedorActivoTipo: true,
  solicitud: { select: { titulo: true } },
  eventosProveedor: {
    select: {
      id: true,
      externalEventId: true,
      joinUrl: true,
      estadoIntegracion: true,
      operacionPendiente: true,
      reunionProveedorId: true,
      cuentaProveedorId: true,
      cuentaProveedor: { select: { emailOrganizador: true } },
      proveedor: { select: { tipo: true } },
    },
  },
} satisfies Prisma.InstanciaSalaSelect;

type InstanciaSerie = Prisma.InstanciaSalaGetPayload<{ select: typeof seleccionInstancia }>;

type CitaCorreccion = Readonly<{
  instanciaId: string;
  calendarId: string | null;
  calendarEventId: string | null;
  /** Reunión Zoom que tenía el encuentro antes de la corrección: se retira tras la convivencia. */
  reunionAnteriorExternalId: string | null;
}>;

type PreparacionSerie =
  | Readonly<{ tipo: "SIN_CAMBIOS"; reunionId: string | null; instanciaIds: readonly string[] }>
  | Readonly<{
    tipo: "CORREGIR";
    reunionId: string;
    hostId: string;
    hostEmail: string;
    titulo: string;
    /** Token del reclamo de creación; null si la reunión ya existe y está creada. */
    reclamoToken: string | null;
    externalId: string | null;
    instanciaIds: readonly string[];
    eventoIds: readonly string[];
    citas: readonly CitaCorreccion[];
  }>;

/**
 * Unifica una serie de Zoom que hoy tiene enlaces o cuentas distintas en UNA reunión recurrente
 * compartida (opción B del plan: enlace nuevo para todos los encuentros). Solo Administración.
 * Idempotente y reanudable por serie: reintentar no crea otra reunión, retoma las citas de
 * Calendar pendientes y no repite avisos. Los encuentros no cambian de enlace en Sala Virtual
 * hasta que cada cita de Calendar con enlace quedó verificada. Las reuniones antiguas se
 * conservan 7 días (`limpiarReunionesAntiguas`). Requiere el worker con soporte de reunión
 * compartida.
 */
export async function corregirSerieEnlaces(
  deps: DependenciasCorreccionSerie,
  actor: Actor,
  input: Readonly<{ serieClave: string }>,
): Promise<ResultadoCorreccionSerie> {
  exigirAdministracionCorreccion(actor);
  const serieClave = input.serieClave;
  try {
    return await corregirSerie(deps, actor, serieClave);
  } catch (error) {
    if (error instanceof FalloEtapa) {
      return {
        serieClave,
        resultado: error.omitida ? "OMITIDA" : "ERROR",
        etapa: error.etapa,
        mensaje: error.message,
        reintentable: error.reintentable,
      };
    }
    return {
      serieClave,
      resultado: "ERROR",
      etapa: "VINCULACION",
      mensaje: error instanceof Error ? error.message : "Error inesperado.",
      reintentable: true,
    };
  }
}

/** Corrige un lote (hasta 5 series) una por una; el error de una no impide las demás. */
export async function corregirSeriesEnlaces(
  deps: DependenciasCorreccionSerie,
  actor: Actor,
  input: Readonly<{ modo: "PILOTO" | "LOTE"; serieClaves: readonly string[] }>,
): Promise<readonly ResultadoCorreccionSerie[]> {
  exigirAdministracionCorreccion(actor);
  const claves = [...new Set(input.serieClaves.filter((clave) => clave.trim().length > 0))];
  if (claves.length === 0) throw new ValidationApiError("Indicá al menos una serie.");
  if (input.modo === "PILOTO" && claves.length !== 1) {
    throw new ValidationApiError("El piloto corrige exactamente una serie.");
  }
  if (claves.length > MAXIMO_LOTE_CORRECCION_SERIE) {
    throw new ValidationApiError(`Un lote admite hasta ${MAXIMO_LOTE_CORRECCION_SERIE} series.`);
  }
  const resultados: ResultadoCorreccionSerie[] = [];
  for (const serieClave of claves) {
    resultados.push(await corregirSerieEnlaces(deps, actor, { serieClave }));
  }
  return resultados;
}

function exigirAdministracionCorreccion(actor: Actor): void {
  if (actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede corregir los enlaces de una serie.");
  }
}

function aEncuentroEnlace(instancia: InstanciaSerie): EncuentroEnlaceSerie {
  const proveedor = proveedorActivoDeInstancia(instancia);
  const tipo = proveedor === "ZOOM" ? "ZOOM" : "GOOGLE_MEET";
  const evento = instancia.eventosProveedor.find((item) => item.proveedor.tipo === tipo);
  return {
    instanciaId: instancia.id,
    inicio: instancia.inicioProgramadoAt,
    estado: instancia.estado,
    proveedor,
    joinUrl: evento?.joinUrl ?? null,
    externalEventId: evento?.externalEventId ?? null,
    cuentaProveedorId: evento?.cuentaProveedorId ?? null,
    reunionProveedorId: evento?.reunionProveedorId ?? null,
  };
}

type Evaluada = Readonly<{
  instancias: readonly InstanciaSerie[];
  vigentes: readonly InstanciaSerie[];
  evaluacion: ReturnType<typeof evaluarEnlacesDeSerie>;
  plan: PlanCorreccionSerie;
  hosts: readonly Readonly<{ id: string; emailOrganizador: string | null; prioridad: number; limiteConcurrente: number | null }>[];
  proveedorZoomId: string;
  reunion: Readonly<{
    id: string;
    cuentaProveedorId: string | null;
    externalId: string | null;
    joinUrl: string | null;
    estadoCreacion: string;
    reclamoAt: Date | null;
  }> | null;
}>;

/** Lee la serie y calcula su plan. Se usa bajo el bloqueo de la serie, al preparar y al vincular. */
async function evaluarSerie(
  tx: Prisma.TransactionClient,
  serieClave: string,
  ahora: Date,
): Promise<Evaluada> {
  const filtro = filtroSerieDesdeClave(serieClave);
  if (!filtro) throw new FalloEtapa("VALIDACION", "La clave de la serie no es válida.", false, true);
  const proveedorZoom = await tx.proveedorReunion.findUnique({ where: { tipo: "ZOOM" } });
  if (!proveedorZoom) throw new FalloEtapa("VALIDACION", "El proveedor Zoom no está configurado.", false);
  await bloquearReservaSalas(tx, proveedorZoom.id);

  const instancias = await tx.instanciaSala.findMany({
    where: { estado: { in: ["PROGRAMADA", "EN_CURSO"] }, finProgramadoAt: { gt: ahora }, solicitud: filtro },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    select: seleccionInstancia,
  });
  if (instancias.length === 0) throw new FalloEtapa("VALIDACION", "La serie no tiene encuentros futuros.", false, true);

  const reunion = await tx.reunionProveedor.findUnique({
    where: { proveedorId_serieClave: { proveedorId: proveedorZoom.id, serieClave } },
    select: { id: true, cuentaProveedorId: true, externalId: true, joinUrl: true, estadoCreacion: true, reclamoAt: true },
  });
  const hostsDb = await tx.cuentaProveedor.findMany({
    where: { activa: true, tieneLicencia: true, proveedor: { tipo: "ZOOM" } },
    orderBy: [{ prioridad: "asc" }, { id: "asc" }],
    select: { id: true, emailOrganizador: true, prioridad: true, limiteConcurrente: true },
  });
  // Reanudación: la sala de una reunión ya creada queda fija.
  const hosts = reunion?.cuentaProveedorId && reunion.estadoCreacion === "CREADA"
    ? hostsDb.filter(({ id }) => id === reunion.cuentaProveedorId)
    : hostsDb;

  const ids = instancias.map(({ id }) => id);
  const reservas = await tx.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "ZOOM" },
      cuentaProveedorId: { not: null },
      instanciaSalaId: { notIn: ids },
      instancia: { estado: { in: ["PROGRAMADA", "EN_CURSO"] }, finProgramadoAt: { gt: ahora } },
    },
    select: { cuentaProveedorId: true, instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } } },
  });

  const evaluacion = evaluarEnlacesDeSerie(instancias.map(aEncuentroEnlace), ahora);
  const vigentes = instancias.filter((instancia) => instancia.estado === "PROGRAMADA");
  const plan = planificarCorreccionSerie({
    ahora,
    margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS_APLICAR,
    encuentros: instancias.map((instancia) => {
      const zoom = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM");
      const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
      return {
        instanciaId: instancia.id,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt,
        joinUrl: zoom?.joinUrl ?? null,
        externalEventId: zoom?.externalEventId ?? null,
        cuentaProveedorId: zoom?.cuentaProveedorId ?? null,
        calendarId: meet?.cuentaProveedor?.emailOrganizador ?? null,
        calendarEventId: meet?.externalEventId ?? null,
      };
    }),
    hosts: hosts.map((host) => ({ ...host, limiteConcurrente: 1 })),
    reservasZoom: reservas.flatMap(({ cuentaProveedorId, instancia }) =>
      cuentaProveedorId
        ? [{ cuentaProveedorId, inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt }]
        : []),
  });
  return { instancias, vigentes, evaluacion, plan, hosts, proveedorZoomId: proveedorZoom.id, reunion };
}

async function prepararBajoBloqueo(
  deps: DependenciasCorreccionSerie,
  serieClave: string,
): Promise<PreparacionSerie> {
  const ahora = (deps.ahora ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveBloqueoSerieMigracion(serieClave)}))`;
    const serie = await evaluarSerie(tx, serieClave, ahora);
    const instanciaIds = serie.vigentes.map(({ id }) => id);
    const pendientes = serie.reunion
      ? await tx.cambioEnlaceCita.count({ where: { reunionProveedorId: serie.reunion.id, estado: { not: "VERIFICADA" } } })
      : 0;

    if (serie.evaluacion.mixta) {
      throw new FalloEtapa(
        "VALIDACION",
        "La serie tiene encuentros en Meet y en Zoom: se resuelve con la migración por serie.",
        false,
        true,
      );
    }
    // Ya unificada (o con un solo enlace y cuenta) y sin citas pendientes: nada que corregir.
    if ((serie.evaluacion.unificada || !serie.evaluacion.necesitaCorreccion) && pendientes === 0) {
      return { tipo: "SIN_CAMBIOS", reunionId: serie.reunion?.id ?? null, instanciaIds };
    }
    if (serie.plan.estado !== "CORREGIBLE" || !serie.plan.hostId) {
      throw new FalloEtapa(
        "VALIDACION",
        `La serie no se puede corregir ahora (${serie.plan.estado}).`,
        serie.plan.estado !== "REVISAR",
        true,
      );
    }
    const host = serie.hosts.find(({ id }) => id === serie.plan.hostId);
    if (!host?.emailOrganizador) throw new FalloEtapa("VALIDACION", "La sala elegida no tiene un correo de anfitrión.", false);

    const eventoIds: string[] = [];
    for (const instancia of serie.vigentes) {
      const zoom = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM");
      if (!zoom) throw new FalloEtapa("VALIDACION", "Un encuentro de la serie no tiene reunión Zoom: revisá la serie.", false, true);
      if (zoom.operacionPendiente) {
        throw new FalloEtapa("VALIDACION", "Un encuentro tiene una operación de Zoom pendiente: esperá a que termine.", true, true);
      }
      if (zoom.reunionProveedorId && zoom.reunionProveedorId !== serie.reunion?.id) {
        throw new FalloEtapa("VALIDACION", "Un encuentro ya pertenece a otra reunión compartida: revisá la serie.", false, true);
      }
      eventoIds.push(zoom.id);
    }

    // Reunión compartida: se reutiliza si existe; si no, se reclama su creación (una sola vez, aunque dos personas lo intenten).
    const reunionId = serie.reunion?.id ?? (await tx.reunionProveedor.create({
      data: { proveedorId: serie.proveedorZoomId, cuentaProveedorId: serie.plan.hostId, serieClave },
      select: { id: true },
    })).id;
    const creada = serie.reunion?.estadoCreacion === "CREADA" && Boolean(serie.reunion.externalId);
    const reclamoToken = creada ? null : randomUUID();
    if (reclamoToken) {
      const vencido = new Date(ahora.getTime() - RECLAMO_CREACION_TIMEOUT_MS);
      const reclamo = await tx.reunionProveedor.updateMany({
        where: {
          id: reunionId,
          OR: [
            { estadoCreacion: { in: ["PENDIENTE", "ELIMINADA"] } },
            { estadoCreacion: "CREANDO", reclamoAt: { lt: vencido } },
            { estadoCreacion: "CREADA", externalId: null },
          ],
        },
        data: {
          estadoCreacion: "CREANDO",
          reclamoToken,
          reclamoAt: ahora,
          cuentaProveedorId: serie.plan.hostId,
          ...(serie.reunion?.estadoCreacion === "ELIMINADA" ? { externalId: null, joinUrl: null } : {}),
        },
      });
      if (reclamo.count !== 1) {
        throw new FalloEtapa("ZOOM", "Otra corrección de esta serie está creando la reunión Zoom: reintentá en unos minutos.");
      }
    }
    const externalId = serie.reunion && serie.reunion.estadoCreacion !== "ELIMINADA" ? serie.reunion.externalId : null;

    return {
      tipo: "CORREGIR",
      reunionId,
      hostId: serie.plan.hostId,
      hostEmail: host.emailOrganizador,
      titulo: serie.vigentes[0].solicitud.titulo,
      reclamoToken,
      externalId,
      instanciaIds,
      eventoIds,
      citas: serie.vigentes.map((instancia): CitaCorreccion => {
        const zoom = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM");
        const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
        return {
          instanciaId: instancia.id,
          calendarId: meet?.cuentaProveedor?.emailOrganizador ?? null,
          calendarEventId: meet?.externalEventId ?? null,
          reunionAnteriorExternalId: zoom?.externalEventId ?? null,
        };
      }),
    };
  });
}

async function corregirSerie(
  deps: DependenciasCorreccionSerie,
  actor: Actor,
  serieClave: string,
): Promise<ResultadoCorreccionSerie> {
  const prep = await prepararBajoBloqueo(deps, serieClave);
  if (prep.tipo === "SIN_CAMBIOS") {
    // Reintento tras una corrección hecha: completa solo los avisos que falten. Una serie que ya
    // nació unificada (sin auditoría de corrección) no recibe aviso.
    const corregida = await deps.db.auditoria.findFirst({
      where: { accion: "SERIE_ENLACE_UNIFICADO", entidadTipo: "SerieReunion", entidadId: serieClave },
      select: { id: true },
    });
    if (!corregida || !prep.reunionId) return { serieClave, resultado: "YA_UNIFICADA", etapa: "VALIDACION", reintentable: false };
    const reunion = await deps.db.reunionProveedor.findUnique({ where: { id: prep.reunionId }, select: { joinUrl: true } });
    const avisos = reunion?.joinUrl ? await enviarAvisos(deps, serieClave, prep.instanciaIds, reunion.joinUrl) : undefined;
    return { serieClave, resultado: "YA_UNIFICADA", etapa: "AVISOS", reintentable: avisos?.estado === "PARCIAL", avisos };
  }

  // 1. Zoom: crea (o recupera) la reunión recurrente una sola vez y verifica su enlace.
  const { externalId, joinUrl } = await asegurarReunionZoom(deps, serieClave, prep);

  // 2. Calendar: parchea y verifica la cita de cada encuentro. Un fallo deja la serie sin vincular.
  await actualizarCitas(deps, prep, joinUrl);

  // 3. Vincula todos los encuentros a la reunión nueva en una sola transacción.
  const ahora = (deps.ahora ?? (() => new Date()))();
  await deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveBloqueoSerieMigracion(serieClave)}))`;
    // Revalida: la sala debe seguir libre en todos los horarios y la serie no puede haber cambiado.
    const serie = await evaluarSerie(tx, serieClave, ahora);
    if (serie.plan.estado !== "CORREGIBLE" || serie.plan.hostId !== prep.hostId) {
      throw new FalloEtapa("VINCULACION", "La serie cambió durante la corrección o la sala dejó de estar libre; reintentá.");
    }
    const vinculados = await tx.eventoProveedor.updateMany({
      where: { id: { in: [...prep.eventoIds] }, operacionPendiente: null },
      data: {
        cuentaProveedorId: prep.hostId,
        reunionProveedorId: prep.reunionId,
        externalEventId: externalId,
        codigoReunion: externalId,
        joinUrl,
        estadoIntegracion: "SINCRONIZADA",
        errorIntegracion: null,
      },
    });
    if (vinculados.count !== prep.eventoIds.length) {
      throw new FalloEtapa("VINCULACION", "Algún encuentro cambió durante la corrección; revisá la serie y reintentá.");
    }
    // La limpieza de las reuniones antiguas queda diferida: nada se elimina ahora.
    await tx.cambioEnlaceCita.updateMany({
      where: { reunionProveedorId: prep.reunionId, reunionAnteriorExternalId: { not: null }, eliminarDespuesDe: null },
      data: { eliminarDespuesDe: new Date(ahora.getTime() + DIAS_CONVIVENCIA_REUNION_ANTIGUA * 86_400_000) },
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "SERIE_ENLACE_UNIFICADO",
        entidadTipo: "SerieReunion",
        entidadId: serieClave,
        valorAnterior: { reunionesAnteriores: prep.citas.flatMap(({ reunionAnteriorExternalId }) => reunionAnteriorExternalId ? [reunionAnteriorExternalId] : []) },
        valorNuevo: {
          reunionProveedorId: prep.reunionId,
          zoomMeetingId: externalId,
          cuentaProveedorId: prep.hostId,
          instanciaIds: [...prep.instanciaIds],
        },
      },
    });
  }).catch((error: unknown) => {
    if (error instanceof FalloEtapa) throw error;
    throw new FalloEtapa("VINCULACION", error instanceof Error ? error.message : "No se pudieron vincular los encuentros.");
  });

  // 4. Avisos, una vez por serie y destinatario. Un fallo de correo no revierte nada: se reintenta reaplicando.
  const avisos = await enviarAvisos(deps, serieClave, prep.instanciaIds, joinUrl);
  return {
    serieClave,
    resultado: "CORREGIDA",
    etapa: "AVISOS",
    encuentros: prep.instanciaIds.length,
    reintentable: avisos.estado === "PARCIAL",
    avisos,
  };
}

async function asegurarReunionZoom(
  deps: DependenciasCorreccionSerie,
  serieClave: string,
  prep: Extract<PreparacionSerie, { tipo: "CORREGIR" }>,
): Promise<Readonly<{ externalId: string; joinUrl: string }>> {
  try {
    const externalId = await (async () => {
      if (!prep.reclamoToken) return prep.externalId as string;
      const marca = `[serie:${serieClave}]`;
      const existente = prep.externalId
        ? { meetingId: prep.externalId }
        : await deps.zoom.buscarPorMarca(prep.hostEmail, marca);
      const info = existente ?? await deps.zoom.crearRecurrente(prep.hostEmail, { topic: prep.titulo, agenda: marca });
      // El ID se guarda apenas existe: si algo falla después, el reintento reutiliza esta reunión.
      const guardado = await deps.db.reunionProveedor.updateMany({
        where: { id: prep.reunionId, estadoCreacion: "CREANDO", reclamoToken: prep.reclamoToken },
        data: { externalId: info.meetingId },
      });
      if (guardado.count !== 1) throw new Error("El reclamo de la reunión ya no es válido; otro proceso la tomó.");
      return info.meetingId;
    })();

    const joinUrl = (await deps.verificarReunionZoom(externalId)).joinUrl;
    if (!esUrlZoom(joinUrl)) throw new FalloEtapa("ZOOM", "Zoom devolvió un enlace de acceso inválido.", false);
    await deps.db.reunionProveedor.updateMany({
      where: prep.reclamoToken
        ? { id: prep.reunionId, estadoCreacion: "CREANDO", reclamoToken: prep.reclamoToken }
        : { id: prep.reunionId },
      data: { estadoCreacion: "CREADA", externalId, joinUrl, errorIntegracion: null, reclamoToken: null, reclamoAt: null },
    });
    return { externalId, joinUrl };
  } catch (error) {
    // Libera el reclamo para que el reintento no espere a que venza; el ID de Zoom ya guardado se conserva.
    if (prep.reclamoToken) {
      await deps.db.reunionProveedor.updateMany({
        where: { id: prep.reunionId, estadoCreacion: "CREANDO", reclamoToken: prep.reclamoToken },
        data: { estadoCreacion: "PENDIENTE", reclamoToken: null, reclamoAt: null },
      }).catch(() => undefined);
    }
    if (error instanceof FalloEtapa) throw error;
    throw new FalloEtapa("ZOOM", error instanceof Error ? error.message : "Falló la creación de la reunión Zoom.");
  }
}

async function actualizarCitas(
  deps: DependenciasCorreccionSerie,
  prep: Extract<PreparacionSerie, { tipo: "CORREGIR" }>,
  joinUrl: string,
): Promise<void> {
  const previas = await deps.db.cambioEnlaceCita.findMany({
    where: { reunionProveedorId: prep.reunionId, instanciaSalaId: { in: [...prep.instanciaIds] } },
    select: { id: true, instanciaSalaId: true, enlaceNuevo: true, estado: true },
  });
  const fallos: string[] = [];
  for (const cita of prep.citas) {
    const sinCita = !cita.calendarId || !cita.calendarEventId;
    const previa = previas.find(({ instanciaSalaId }) => instanciaSalaId === cita.instanciaId);
    const estadoInicial = sinCita ? "VERIFICADA" : "PENDIENTE";
    // Un enlace distinto al registrado (Zoom lo cambió) invalida el avance previo.
    const vigente = previa && previa.enlaceNuevo === joinUrl ? previa : null;
    const registro = vigente
      ?? (previa
        ? await deps.db.cambioEnlaceCita.update({
          where: { id: previa.id },
          data: { enlaceNuevo: joinUrl, estado: estadoInicial, sinCita },
          select: { id: true, estado: true },
        })
        : await deps.db.cambioEnlaceCita.create({
          data: {
            instanciaSalaId: cita.instanciaId,
            reunionProveedorId: prep.reunionId,
            enlaceNuevo: joinUrl,
            estado: estadoInicial,
            sinCita,
            reunionAnteriorExternalId: cita.reunionAnteriorExternalId,
          },
          select: { id: true, estado: true },
        }));
    if (registro.estado === "VERIFICADA" || sinCita) continue;

    const ref = { calendarId: cita.calendarId!, eventId: cita.calendarEventId! };
    try {
      const actual = await deps.calendar.obtener(ref);
      const cambio = prepararCambioEnlaceZoomACalendar(actual, null, joinUrl);
      if (registro.estado !== "PARCHEADA") {
        await deps.calendar.actualizar({ ...ref, cambio });
        await deps.db.cambioEnlaceCita.update({ where: { id: registro.id }, data: { estado: "PARCHEADA" } });
      }
      const verificado = await deps.calendar.obtener(ref);
      const descripcion = verificado.description ?? "";
      const sinMeet = !verificado.conferenceData && !verificado.hangoutLink;
      const unSoloEnlace = descripcion.includes(joinUrl)
        && !/zoom\.(?:us|com)\/[jw]\//i.test(descripcion.split(joinUrl).join(""));
      const ubicacionIntacta = cambio.location !== undefined
        ? verificado.location === cambio.location
        : verificado.location === actual.location;
      if (!sinMeet || !unSoloEnlace || !ubicacionIntacta) throw new Error("Google Calendar no refleja el enlace único de Zoom.");
      await deps.db.cambioEnlaceCita.update({ where: { id: registro.id }, data: { estado: "VERIFICADA" } });
    } catch (error) {
      fallos.push(error instanceof Error ? error.message : "Falló la actualización de Google Calendar.");
    }
  }
  if (fallos.length > 0) {
    throw new FalloEtapa(
      "CALENDAR",
      `${fallos.length} de ${prep.citas.length} citas de Calendar quedaron pendientes: ${fallos[0]} Reintentá para retomarlas.`,
    );
  }
}

async function enviarAvisos(
  deps: DependenciasCorreccionSerie,
  serieClave: string,
  instanciaIds: readonly string[],
  joinUrl: string,
): Promise<ResumenAvisosMigracion> {
  if (!deps.enviarCorreo) {
    return {
      estado: "NO_CONFIGURADO", motivo: "No hay transporte de correo configurado.",
      destinatarios: 0, enviados: 0, yaEnviados: 0, enCurso: 0, errores: 0, detalle: [],
    };
  }
  try {
    return await (deps.notificarCambioSerie ?? notificarCambioEnlaceSerie)({
      db: deps.db,
      enviarCorreo: deps.enviarCorreo,
      leerInvitadosCalendar: async (calendarId, eventId) =>
        (await deps.calendar.obtener({ calendarId, eventId })).attendees?.map(({ email }) => email) ?? [],
      ahora: deps.ahora,
    }, { serieClave, instanciaIds, tipo: "CORRECCION_ENLACE", joinUrl });
  } catch (error) {
    return {
      estado: "PARCIAL", motivo: error instanceof Error ? error.message : "No se pudieron preparar los avisos.",
      destinatarios: 0, enviados: 0, yaEnviados: 0, enCurso: 0, errores: 1, detalle: [],
    };
  }
}

export type ResultadoLimpiezaReuniones = Readonly<{ eliminadas: number; pendientes: number; errores: number }>;

/**
 * Elimina las reuniones Zoom antiguas de las series ya corregidas cuando venció su convivencia
 * (7 días). Solo actúa en series con todas sus citas verificadas, no elimina dos veces la misma
 * reunión aunque la compartan varias filas, tolera una reunión ya inexistente (404) y es idempotente.
 */
export async function limpiarReunionesAntiguas(
  deps: DependenciasCorreccionSerie,
  actor: Actor,
  ahora: Date = (deps.ahora ?? (() => new Date()))(),
): Promise<ResultadoLimpiezaReuniones> {
  exigirAdministracionCorreccion(actor);
  const filas = await deps.db.cambioEnlaceCita.findMany({
    where: { reunionAnteriorExternalId: { not: null }, reunionAnteriorEliminadaAt: null, eliminarDespuesDe: { not: null } },
    select: {
      id: true,
      reunionProveedorId: true,
      reunionAnteriorExternalId: true,
      eliminarDespuesDe: true,
      reunion: { select: { externalId: true, cambiosCita: { select: { estado: true } } } },
    },
  });
  const listas = filas.filter((fila) =>
    fila.eliminarDespuesDe !== null
    && fila.eliminarDespuesDe <= ahora
    && fila.reunion.cambiosCita.every(({ estado }) => estado === "VERIFICADA")
    // Nunca se elimina la reunión vigente de la serie.
    && fila.reunionAnteriorExternalId !== fila.reunion.externalId);
  const pendientes = filas.length - listas.length;

  const porReunion = [...new Set(listas.map(({ reunionAnteriorExternalId }) => reunionAnteriorExternalId as string))];
  const resultados = await porReunion.reduce<Promise<Readonly<{ eliminadas: number; errores: number; omitidas: number }>>>(
    async (previo, meetingId) => {
      const acumulado = await previo;
      try {
        // Si otro encuentro todavía usa esa reunión (por ejemplo, otra serie), no se elimina.
        const enUso = await deps.db.eventoProveedor.count({
          where: { externalEventId: meetingId, proveedor: { tipo: "ZOOM" } },
        });
        if (enUso > 0) return { ...acumulado, omitidas: acumulado.omitidas + 1 };
        await deps.zoom.eliminar(meetingId);
        await deps.db.cambioEnlaceCita.updateMany({
          where: { reunionAnteriorExternalId: meetingId, reunionAnteriorEliminadaAt: null, id: { in: listas.map(({ id }) => id) } },
          data: { reunionAnteriorEliminadaAt: ahora },
        });
        return { ...acumulado, eliminadas: acumulado.eliminadas + 1 };
      } catch {
        return { ...acumulado, errores: acumulado.errores + 1 };
      }
    },
    Promise.resolve({ eliminadas: 0, errores: 0, omitidas: 0 }),
  );
  return {
    eliminadas: resultados.eliminadas,
    pendientes: pendientes + resultados.omitidas,
    errores: resultados.errores,
  };
}
