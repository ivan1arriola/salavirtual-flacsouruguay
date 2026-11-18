import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  ConflictApiError,
  ForbiddenApiError,
  IntegrationApiError,
  NotFoundApiError
} from "@/src/lib/http/api-error";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { elegirOcurrenciaDelEncuentro } from "./zoom-agenda-observada.domain";
import { leerInconsistenciasAgendaZoom, reservasZoomExternas } from "./zoom-agenda-observada.service";
import type { ReunionZoomAuditable } from "./zoom-diagnostico.domain";

const ZONA_POR_DEFECTO = "America/Montevideo";
const RECLAMO_MS = 10 * 60_000;
const MIN_MS = 60_000;

export type DependenciasAccionesAgendaZoom = Readonly<{
  db: PrismaClient;
  /** Encuentros Zoom auditables (los mismos que alimentan la pestaña). */
  reuniones: () => Promise<readonly ReunionZoomAuditable[]>;
  zoom: Readonly<{
    /** Cambia el horario de una reunión (ocurrenciaZoomId vacío) o de una ocurrencia. */
    actualizarHorario: (
      meetingId: string,
      ocurrenciaZoomId: string,
      input: Readonly<{ startTime: Date; durationMinutes: number; timezone: string }>
    ) => Promise<void>;
    crearReunion: (
      hostEmail: string,
      input: Readonly<{
        topic: string;
        startTime: Date;
        durationMinutes: number;
        timezone: string;
        requiereGrabacion: boolean;
      }>
    ) => Promise<Readonly<{ meetingId: string; joinUrl: string }>>;
  }>;
  /** Casos de uso existentes de gestionar-encuentros, ya enlazados a la base. */
  reprogramarEncuentro: (
    actor: SessionActor,
    solicitudId: string,
    instanciaId: string,
    input: Readonly<{ accion: "EDITAR_FECHA"; inicio: Date; fin: Date }>
  ) => Promise<Readonly<{ eventoProveedorIds: readonly string[] }>>;
  eliminarEncuentro: (
    actor: SessionActor,
    solicitudId: string,
    instanciaId: string
  ) => Promise<Readonly<{ eventoProveedorIds: readonly string[] }>>;
  ahora?: () => Date;
}>;

export type ResultadoAccionAgendaZoom = Readonly<{ eventoProveedorIds: readonly string[] }>;
const SIN_EVENTOS: ResultadoAccionAgendaZoom = { eventoProveedorIds: [] };

function exigirAdministracion(actor: SessionActor): void {
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede actuar sobre la agenda de Zoom.");
  }
}

/** Una llamada a Zoom que falla nunca deja cambios locales: se informa y se corta antes de escribir. */
async function llamarZoom<T>(accion: () => Promise<T>, que: string): Promise<T> {
  try {
    return await accion();
  } catch {
    throw new IntegrationApiError(
      `Zoom no pudo ${que}. No se cambió nada en Sala Virtual; revisá la integración e intentá de nuevo.`
    );
  }
}

const auditar = (
  db: Pick<PrismaClient, "auditoria">,
  actorId: string,
  accion: string,
  entidadTipo: string,
  entidadId: string,
  anterior: Prisma.InputJsonValue | null,
  nuevo: Prisma.InputJsonValue | null
) =>
  db.auditoria.create({
    data: {
      actorUsuarioId: actorId,
      accion,
      entidadTipo,
      entidadId,
      valorAnterior: anterior ?? Prisma.JsonNull,
      valorNuevo: nuevo ?? Prisma.JsonNull
    }
  });

/** Revalida contra el estado actual: la diferencia pudo resolverse mientras la página estaba abierta. */
async function diferenciaVigente(deps: DependenciasAccionesAgendaZoom) {
  const reuniones = await deps.reuniones();
  const agenda = await leerInconsistenciasAgendaZoom(deps.db, reuniones, deps.ahora?.() ?? new Date());
  return {
    agenda,
    reuniones,
    ya: () => new ConflictApiError("Esa diferencia ya no existe. Actualizá la página.")
  };
}

export async function ignorarReunionExterna(
  db: PrismaClient,
  actor: SessionActor,
  input: Readonly<{ observadaId: string; ignorar: boolean }>,
  ahora = new Date()
): Promise<ResultadoAccionAgendaZoom> {
  exigirAdministracion(actor);
  const fila = await db.reunionZoomObservada.findUnique({
    where: { id: input.observadaId },
    select: { id: true, meetingId: true, ignoradaAt: true }
  });
  if (!fila) {
    throw new NotFoundApiError("La reunión observada no existe.");
  }
  await db.$transaction([
    db.reunionZoomObservada.update({
      where: { id: fila.id },
      data: input.ignorar
        ? { ignoradaAt: ahora, ignoradaPorId: actor.id }
        : { ignoradaAt: null, ignoradaPorId: null }
    }),
    auditar(
      db,
      actor.id,
      input.ignorar ? "ZOOM_REUNION_EXTERNA_IGNORADA" : "ZOOM_REUNION_EXTERNA_RESTAURADA",
      "ReunionZoomObservada",
      fila.id,
      { ignorada: Boolean(fila.ignoradaAt) },
      { ignorada: input.ignorar, meetingId: fila.meetingId }
    )
  ]);
  return SIN_EVENTOS;
}

/** Empuja a la ocurrencia de Zoom el horario del encuentro de Sala Virtual (la fuente de verdad). */
export async function corregirHorarioEnZoom(
  deps: DependenciasAccionesAgendaZoom,
  actor: SessionActor,
  input: Readonly<{ instanciaId: string }>
): Promise<ResultadoAccionAgendaZoom> {
  exigirAdministracion(actor);
  const { agenda, reuniones, ya } = await diferenciaVigente(deps);
  const item = agenda.horarioDistinto.find(({ reunion }) => reunion.instanciaId === input.instanciaId);
  if (!item?.reunion.meetingId) {
    throw ya();
  }
  const { reunion, enZoom } = item;
  const elegida = elegirOcurrenciaDelEncuentro(reunion, enZoom, reuniones);
  if (!elegida.ok) {
    throw new ConflictApiError(elegida.motivo);
  }
  const instancia = await deps.db.instanciaSala.findUnique({
    where: { id: reunion.instanciaId },
    select: { estado: true, timezone: true }
  });
  if (!instancia || instancia.estado !== "PROGRAMADA") {
    throw new ConflictApiError("El encuentro ya no está programado.");
  }
  // Zoom no distingue cuentas ocupadas: la sala del anfitrión no puede quedar con dos reuniones a la vez.
  const { ocurrencia } = elegida;
  const choqueLocal = reuniones.some(
    (otra) =>
      otra.instanciaId !== reunion.instanciaId &&
      otra.cuentaId !== null &&
      otra.cuentaId === ocurrencia.cuentaProveedorId &&
      otra.inicio < reunion.fin &&
      reunion.inicio < otra.fin
  );
  const externas = ocurrencia.cuentaProveedorId
    ? await reservasZoomExternas(deps.db, {
        cuentaIds: [ocurrencia.cuentaProveedorId],
        desde: reunion.inicio,
        hasta: reunion.fin
      })
    : [];
  if (choqueLocal || externas.length > 0) {
    throw new ConflictApiError(
      "La sala de Zoom ya está ocupada en el horario del encuentro (otro encuentro o una reunión creada en Zoom)."
    );
  }

  // Última comprobación justo antes de la llamada externa: si otra operación movió o canceló el encuentro
  // desde la lectura inicial, no se empuja un horario obsoleto a Zoom.
  const vigente = await deps.db.instanciaSala.findUnique({
    where: { id: reunion.instanciaId },
    select: { estado: true, inicioProgramadoAt: true, finProgramadoAt: true }
  });
  if (
    vigente?.estado !== "PROGRAMADA" ||
    vigente.inicioProgramadoAt.getTime() !== reunion.inicio.getTime() ||
    vigente.finProgramadoAt.getTime() !== reunion.fin.getTime()
  ) {
    throw new ConflictApiError(
      "El encuentro cambió mientras se preparaba la corrección. Actualizá la página."
    );
  }
  const duracion = Math.max(1, Math.round((reunion.fin.getTime() - reunion.inicio.getTime()) / MIN_MS));
  await llamarZoom(
    () =>
      deps.zoom.actualizarHorario(item.reunion.meetingId as string, ocurrencia.ocurrenciaZoomId, {
        startTime: reunion.inicio,
        durationMinutes: duracion,
        timezone: instancia.timezone || ZONA_POR_DEFECTO
      }),
    "actualizar el horario de la reunión"
  );
  // Espejo local inmediato: el webhook de Zoom llegará igual y dejará lo mismo.
  await deps.db.$transaction([
    deps.db.reunionZoomObservada.update({
      where: { id: ocurrencia.id },
      data: { inicioAt: reunion.inicio, finAt: reunion.fin, origen: "PULL", observadaAt: new Date() }
    }),
    auditar(
      deps.db,
      actor.id,
      "ZOOM_HORARIO_CORREGIDO_EN_ZOOM",
      "InstanciaSala",
      reunion.instanciaId,
      { inicioZoom: ocurrencia.inicio.toISOString(), finZoom: ocurrencia.fin.toISOString() },
      { inicio: reunion.inicio.toISOString(), fin: reunion.fin.toISOString(), meetingId: reunion.meetingId }
    )
  ]);
  return SIN_EVENTOS;
}

/** Cambia el encuentro de Sala Virtual al horario observado en Zoom, con las validaciones de la reprogramación. */
export async function adoptarHorarioDeZoom(
  deps: DependenciasAccionesAgendaZoom,
  actor: SessionActor,
  input: Readonly<{ instanciaId: string }>
): Promise<ResultadoAccionAgendaZoom> {
  exigirAdministracion(actor);
  const { agenda, reuniones, ya } = await diferenciaVigente(deps);
  const item = agenda.horarioDistinto.find(({ reunion }) => reunion.instanciaId === input.instanciaId);
  if (!item) {
    throw ya();
  }
  const elegida = elegirOcurrenciaDelEncuentro(item.reunion, item.enZoom, reuniones);
  if (!elegida.ok) {
    throw new ConflictApiError(elegida.motivo);
  }
  const { reunion } = item;
  const inicio = elegida.ocurrencia.inicio;
  const fin = new Date(inicio.getTime() + (reunion.fin.getTime() - reunion.inicio.getTime()));
  const resultado = await deps.reprogramarEncuentro(actor, reunion.solicitudId, reunion.instanciaId, {
    accion: "EDITAR_FECHA",
    inicio,
    fin
  });
  // La reprogramación ya está confirmada (y auditada por su propio caso de uso): un fallo de esta auditoría
  // complementaria no debe ocultar los eventos pendientes de sincronizar con Zoom.
  await auditar(
    deps.db,
    actor.id,
    "ZOOM_HORARIO_ADOPTADO_DE_ZOOM",
    "InstanciaSala",
    reunion.instanciaId,
    { inicio: reunion.inicio.toISOString(), fin: reunion.fin.toISOString() },
    { inicio: inicio.toISOString(), fin: fin.toISOString(), meetingId: reunion.meetingId }
  ).catch(() => undefined);
  return resultado;
}

/** Cancela en Sala Virtual un encuentro cuya reunión ya no existe en Zoom (conserva al menos uno por serie). */
export async function cancelarEncuentroEliminadoEnZoom(
  deps: DependenciasAccionesAgendaZoom,
  actor: SessionActor,
  input: Readonly<{ instanciaId: string }>
): Promise<ResultadoAccionAgendaZoom> {
  exigirAdministracion(actor);
  const { agenda, ya } = await diferenciaVigente(deps);
  const reunion = agenda.eliminadasEnZoom.find(({ instanciaId }) => instanciaId === input.instanciaId);
  if (!reunion) {
    throw ya();
  }
  // eliminarEncuentro ya impide dejar la reunión sin encuentros y audita la baja.
  return deps.eliminarEncuentro(actor, reunion.solicitudId, reunion.instanciaId);
}

/**
 * Crea de nuevo la reunión en Zoom para un encuentro cuya reunión fue eliminada allá. Solo encuentros con
 * reunión propia: si forman parte de una reunión compartida (serie), se repara desde la corrección de series.
 */
export async function recrearReunionEnZoom(
  deps: DependenciasAccionesAgendaZoom,
  actor: SessionActor,
  input: Readonly<{ instanciaId: string }>
): Promise<ResultadoAccionAgendaZoom> {
  exigirAdministracion(actor);
  const { agenda, ya } = await diferenciaVigente(deps);
  const auditable = agenda.eliminadasEnZoom.find(({ instanciaId }) => instanciaId === input.instanciaId);
  if (!auditable) {
    throw ya();
  }
  const instancia = await deps.db.instanciaSala.findUnique({
    where: { id: auditable.instanciaId },
    select: {
      estado: true,
      timezone: true,
      requiereGrabacion: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      proveedorActivoTipo: true,
      solicitud: { select: { titulo: true } },
      eventosProveedor: {
        select: {
          id: true,
          externalEventId: true,
          reunionProveedorId: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
          proveedor: { select: { tipo: true } }
        }
      }
    }
  });
  const evento = instancia ? seleccionarEventoProveedorActivo(instancia) : null;
  if (!instancia || !evento || evento.proveedor.tipo !== "ZOOM" || instancia.estado !== "PROGRAMADA") {
    throw new ConflictApiError("El encuentro ya no es una reunión de Zoom programada.");
  }
  if (evento.reunionProveedorId) {
    throw new ConflictApiError(
      "El encuentro pertenece a una reunión compartida de la serie: reparala desde la corrección de enlaces de series, no encuentro por encuentro."
    );
  }
  const host = evento.cuentaProveedor?.emailOrganizador;
  if (!host) {
    throw new ConflictApiError("La cuenta de Zoom del encuentro no tiene anfitrión configurado.");
  }
  const duracion = Math.max(
    1,
    Math.round((instancia.finProgramadoAt.getTime() - instancia.inicioProgramadoAt.getTime()) / MIN_MS)
  );
  // Reclamo exclusivo ANTES de llamar a Zoom: dos solicitudes simultáneas no pueden crear dos reuniones.
  const ahora = new Date();
  const token = randomUUID();
  const reclamado = await deps.db.eventoProveedor.updateMany({
    where: {
      id: evento.id,
      externalEventId: evento.externalEventId,
      OR: [
        { reclamoIntegracionAt: null },
        { reclamoIntegracionAt: { lt: new Date(ahora.getTime() - RECLAMO_MS) } }
      ]
    },
    data: { reclamoIntegracionAt: ahora, reclamoIntegracionToken: token }
  });
  if (reclamado.count !== 1) {
    throw new ConflictApiError(
      "Ya hay otra operación en curso sobre este encuentro. Esperá unos minutos y actualizá."
    );
  }
  const creada = await llamarZoom(
    () =>
      deps.zoom.crearReunion(host, {
        topic: instancia.solicitud.titulo,
        startTime: instancia.inicioProgramadoAt,
        durationMinutes: duracion,
        timezone: instancia.timezone || ZONA_POR_DEFECTO,
        requiereGrabacion: instancia.requiereGrabacion
      }),
    "crear la reunión"
  ).catch(async (error: unknown) => {
    // Si Zoom respondió con error la reunión no existe: se libera el reclamo. Ante un resultado incierto
    // (p. ej. corte de red) puede haberse creado: el mensaje lo advierte para revisarlo en Zoom.
    await deps.db.eventoProveedor.updateMany({
      where: { id: evento.id, reclamoIntegracionToken: token },
      data: { reclamoIntegracionAt: null, reclamoIntegracionToken: null }
    });
    throw error;
  });
  // Solo se escribe si el evento sigue como lo leímos: nunca se pisa un cambio concurrente.
  const guardado = await deps.db.eventoProveedor.updateMany({
    where: { id: evento.id, externalEventId: evento.externalEventId, reclamoIntegracionToken: token },
    data: {
      externalEventId: creada.meetingId,
      codigoReunion: creada.meetingId,
      joinUrl: creada.joinUrl,
      hostUrl: null,
      payloadUltimo: {
        meetingId: creada.meetingId,
        joinUrl: creada.joinUrl,
        recreadaAt: new Date().toISOString()
      },
      estadoIntegracion: "SINCRONIZADA",
      operacionPendiente: null,
      reclamoIntegracionAt: null,
      reclamoIntegracionToken: null,
      errorIntegracion: null,
      sincronizadoAt: new Date()
    }
  });
  if (guardado.count !== 1) {
    throw new ConflictApiError(
      `El encuentro cambió mientras se creaba la reunión; la reunión nueva de Zoom (${creada.meetingId}) quedó sin vincular.`
    );
  }
  await auditar(
    deps.db,
    actor.id,
    "ZOOM_REUNION_RECREADA",
    "InstanciaSala",
    auditable.instanciaId,
    { meetingId: evento.externalEventId },
    { meetingId: creada.meetingId }
  );
  return SIN_EVENTOS;
}
