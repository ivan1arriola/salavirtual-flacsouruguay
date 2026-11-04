import type { Prisma } from "@prisma/client";
import { ForbiddenApiError, ValidationApiError } from "@/src/lib/http/api-error";
import { prepararCambioEnlaceCalendarZoom } from "./migracion-zoom-calendar.domain";
import {
  MARGEN_SEGURIDAD_HORAS_APLICAR,
  type DependenciasMigracionZoom,
} from "./migracion-zoom-aplicar.service";
import { esUrlZoom } from "./migracion-zoom-aviso-email.domain";
import type { ResumenAvisosMigracion } from "./migracion-zoom-avisos.service";
import { planificarMigracionZoomPorSerie } from "./migracion-zoom-preview.domain";
import { armarSerieMigracionZoom } from "./migracion-zoom-serie.service";
import { notificarCambioEnlaceSerie } from "./aviso-enlace-serie.service";
import { bloquearReservaSalas } from "./reserva-salas.adapter";
import { claveBloqueoSerieMigracion, filtroSerieDesdeClave, normalizarClaveSerie } from "./serie-reunion.domain";

type Actor = Readonly<{ id: string; rol: string }>;

export const MAXIMO_LOTE_MIGRACION_ZOOM_SERIE = 5;

export type DependenciasMigracionZoomSerie = DependenciasMigracionZoom & Readonly<{
  /** Aviso por serie; por defecto el real. Se inyecta en las pruebas. */
  notificarCambioSerie?: typeof notificarCambioEnlaceSerie;
}>;

export type ResultadoMigracionSerie = Readonly<{
  serieClave: string;
  resultado: "MIGRADA" | "YA_ZOOM" | "OMITIDA" | "ERROR";
  etapa: "VALIDACION" | "ZOOM" | "CALENDAR" | "CAMBIO_PROVEEDOR" | "FINAL";
  mensaje?: string;
  reintentable: boolean;
  encuentros?: number;
  avisos?: ResumenAvisosMigracion;
}>;

class FalloEtapa extends Error {
  constructor(
    public readonly etapa: ResultadoMigracionSerie["etapa"],
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
  conservarGoogleMeet: true,
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

type CitaDeEncuentro = Readonly<{
  instanciaId: string;
  calendarId: string | null;
  calendarEventId: string | null;
  meetJoinUrl: string | null;
}>;

type PreparacionSerie = Readonly<{
  yaZoom: boolean;
  reunionId: string;
  eventoIds: readonly string[];
  instanciaIds: readonly string[];
  /** Todos los encuentros futuros de la serie (también los que ya estaban en Zoom), para el aviso. */
  todasLasInstanciaIds: readonly string[];
  citas: readonly CitaDeEncuentro[];
}>;

/**
 * Convierte una serie completa de Meet a Zoom con UN solo enlace. Solo Administración. Cada serie
 * es independiente e idempotente: reintentar retoma desde la última cita verificada sin crear otra
 * reunión Zoom. El proveedor activo de todos los encuentros cambia en una sola transacción, y solo
 * después de verificar la cita de Calendar de cada uno.
 */
export async function aplicarMigracionZoomSerie(
  deps: DependenciasMigracionZoomSerie,
  actor: Actor,
  input: Readonly<{ modo: "PILOTO" | "LOTE"; serieClaves: readonly string[] }>,
): Promise<readonly ResultadoMigracionSerie[]> {
  if (actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede aplicar la migración a Zoom.");
  }
  const claves = [...new Set(input.serieClaves.filter((clave) => clave.trim().length > 0).map(normalizarClaveSerie))];
  if (claves.length === 0) throw new ValidationApiError("Indicá al menos una serie.");
  if (input.modo === "PILOTO" && claves.length !== 1) {
    throw new ValidationApiError("El piloto convierte exactamente una serie.");
  }
  if (claves.length > MAXIMO_LOTE_MIGRACION_ZOOM_SERIE) {
    throw new ValidationApiError(`Un lote admite hasta ${MAXIMO_LOTE_MIGRACION_ZOOM_SERIE} series.`);
  }

  const resultados: ResultadoMigracionSerie[] = [];
  for (const serieClave of claves) {
    try {
      resultados.push(await migrarSerie(deps, actor, serieClave));
    } catch (error) {
      resultados.push(error instanceof FalloEtapa
        ? {
          serieClave,
          resultado: error.omitida ? "OMITIDA" : "ERROR",
          etapa: error.etapa,
          mensaje: error.message,
          reintentable: error.reintentable,
        }
        : {
          serieClave,
          resultado: "ERROR",
          etapa: "FINAL",
          mensaje: error instanceof Error ? error.message : "Error inesperado.",
          reintentable: true,
        });
    }
  }
  return resultados;
}

/** Revalida bajo el bloqueo de la serie y deja la reunión compartida y los eventos Zoom listos (o reanudables). */
async function prepararBajoBloqueo(
  deps: DependenciasMigracionZoomSerie,
  serieClave: string,
): Promise<PreparacionSerie> {
  const ahora = (deps.ahora ?? (() => new Date()))();
  const filtro = filtroSerieDesdeClave(serieClave);
  if (!filtro) throw new FalloEtapa("VALIDACION", "La clave de la serie no es válida.", false, true);

  return deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveBloqueoSerieMigracion(serieClave)}))`;
    const proveedorZoom = await tx.proveedorReunion.findUnique({ where: { tipo: "ZOOM" } });
    if (!proveedorZoom) throw new FalloEtapa("VALIDACION", "El proveedor Zoom no está configurado.", false);
    await bloquearReservaSalas(tx, proveedorZoom.id);

    const instancias = await tx.instanciaSala.findMany({
      where: { estado: "PROGRAMADA", inicioProgramadoAt: { gt: ahora }, solicitud: filtro },
      orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
      select: seleccionInstancia,
    });
    if (instancias.length === 0) throw new FalloEtapa("VALIDACION", "La serie no tiene encuentros futuros.", false, true);

    const hostsDb = await tx.cuentaProveedor.findMany({
      where: { activa: true, tieneLicencia: true, proveedor: { tipo: "ZOOM" } },
      orderBy: [{ prioridad: "asc" }, { id: "asc" }],
      select: { id: true, emailOrganizador: true, prioridad: true, limiteConcurrente: true },
    });
    const reunion = await tx.reunionProveedor.findUnique({
      where: { proveedorId_serieClave: { proveedorId: proveedorZoom.id, serieClave } },
      select: { id: true, cuentaProveedorId: true },
    });
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

    // Reanudación: la reunión ya existe, así que su cuenta queda fija y los eventos Zoom propios
    // (que todavía no son el proveedor activo) no cuentan como "ya preparados por otra vía".
    const hosts = reunion?.cuentaProveedorId ? hostsDb.filter(({ id }) => id === reunion.cuentaProveedorId) : hostsDb;
    const serie = armarSerieMigracionZoom(serieClave, instancias, hosts);
    const propias = (id: string | null) => Boolean(reunion && id === reunion.id);
    const serieParaPlan = reunion
      ? {
        ...serie,
        cuentaZoomPreferidaId: reunion.cuentaProveedorId,
        encuentros: serie.encuentros.map((encuentro) => {
          const instancia = instancias.find(({ id }) => id === encuentro.id);
          const zoomPropio = instancia?.eventosProveedor.some(({ proveedor, reunionProveedorId }) =>
            proveedor.tipo === "ZOOM" && propias(reunionProveedorId));
          return zoomPropio && encuentro.proveedorActivo !== "ZOOM"
            ? { ...encuentro, zoomSincronizado: false, reunionCompartidaId: null }
            : encuentro;
        }),
      }
      : serie;

    const [fila] = planificarMigracionZoomPorSerie({
      ahora,
      margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS_APLICAR,
      series: [serieParaPlan],
      hosts: hosts.map((host) => ({ ...host, limiteConcurrente: 1 })),
      reservasZoom: reservas.flatMap(({ cuentaProveedorId, instancia }) =>
        cuentaProveedorId
          ? [{ cuentaProveedorId, inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt }]
          : []),
    });
    const todasLasInstanciaIds = ids;
    const vacia = { reunionId: reunion?.id ?? "", eventoIds: [], instanciaIds: [], todasLasInstanciaIds, citas: [] };
    if (fila?.estado === "YA_ZOOM") return { ...vacia, yaZoom: true };
    if (fila?.estado !== "MIGRABLE" || !fila.hostId) {
      throw new FalloEtapa("VALIDACION", `La serie ya no es migrable (${fila?.estado ?? "sin datos"}).`, false, true);
    }

    const reunionId = reunion?.id ?? (await tx.reunionProveedor.create({
      data: { proveedorId: proveedorZoom.id, cuentaProveedorId: fila.hostId, serieClave },
      select: { id: true },
    })).id;

    const aMigrar = instancias.filter(({ id }) => fila.encuentroIds.includes(id));
    const eventoIds: string[] = [];
    const citas: CitaDeEncuentro[] = [];
    for (const instancia of aMigrar) {
      const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
      const zoom = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM");
      if (zoom && zoom.reunionProveedorId !== reunionId) {
        throw new FalloEtapa("VALIDACION", "Un encuentro de la serie ya tiene una reunión Zoom propia: revisá la serie.", false, true);
      }
      if (zoom) {
        eventoIds.push(zoom.id);
        const completo = zoom.estadoIntegracion === "SINCRONIZADA" && zoom.externalEventId && zoom.joinUrl && !zoom.operacionPendiente;
        if (!completo && !zoom.operacionPendiente) {
          await tx.eventoProveedor.update({
            where: { id: zoom.id },
            data: { operacionPendiente: "PROVISIONAR", estadoIntegracion: "PENDIENTE", errorIntegracion: null },
          });
        }
      } else {
        const creado = await tx.eventoProveedor.create({
          data: {
            instanciaSalaId: instancia.id,
            proveedorId: proveedorZoom.id,
            cuentaProveedorId: fila.hostId,
            reunionProveedorId: reunionId,
            operacionPendiente: "PROVISIONAR",
          },
          select: { id: true },
        });
        eventoIds.push(creado.id);
      }
      citas.push({
        instanciaId: instancia.id,
        calendarId: meet?.cuentaProveedor?.emailOrganizador ?? null,
        calendarEventId: meet?.externalEventId ?? null,
        meetJoinUrl: meet?.joinUrl ?? null,
      });
    }
    return { yaZoom: false, reunionId, eventoIds, instanciaIds: aMigrar.map(({ id }) => id), todasLasInstanciaIds, citas };
  });
}

async function migrarSerie(
  deps: DependenciasMigracionZoomSerie,
  actor: Actor,
  serieClave: string,
): Promise<ResultadoMigracionSerie> {
  const prep = await prepararBajoBloqueo(deps, serieClave);
  if (prep.yaZoom) {
    // Reintento tras un cambio hecho por esta migración: completa solo los avisos pendientes.
    // Una serie que nació en Zoom (sin auditoría) no recibe aviso.
    const migrada = await deps.db.auditoria.findFirst({
      where: { accion: "MIGRACION_ZOOM_SERIE_APLICADA", entidadTipo: "SerieReunion", entidadId: serieClave },
      select: { id: true },
    });
    if (!migrada) return { serieClave, resultado: "YA_ZOOM", etapa: "FINAL", reintentable: false };
    const reunion = await deps.db.reunionProveedor.findUnique({ where: { id: prep.reunionId }, select: { joinUrl: true } });
    const avisos = reunion?.joinUrl ? await enviarAvisos(deps, serieClave, prep.todasLasInstanciaIds, reunion.joinUrl) : undefined;
    return { serieClave, resultado: "YA_ZOOM", etapa: "FINAL", reintentable: avisos?.estado === "PARCIAL", avisos };
  }

  // 1. Zoom: la provisión crea la reunión compartida una sola vez (reclamo persistido) y la reutiliza.
  try {
    await deps.sincronizarEventos(prep.eventoIds);
  } catch (error) {
    throw new FalloEtapa("ZOOM", error instanceof Error ? error.message : "Falló la provisión de Zoom.");
  }
  const reunion = await deps.db.reunionProveedor.findUnique({
    where: { id: prep.reunionId },
    select: { externalId: true, joinUrl: true, estadoCreacion: true, errorIntegracion: true },
  });
  if (!reunion || reunion.estadoCreacion !== "CREADA" || !reunion.externalId) {
    throw new FalloEtapa("ZOOM", reunion?.errorIntegracion || "La reunión Zoom de la serie todavía no quedó creada.");
  }
  const eventos = await deps.db.eventoProveedor.findMany({
    where: { id: { in: [...prep.eventoIds] } },
    select: { id: true, estadoIntegracion: true, operacionPendiente: true, errorIntegracion: true },
  });
  const pendiente = eventos.find((evento) => evento.estadoIntegracion !== "SINCRONIZADA" || evento.operacionPendiente);
  if (eventos.length !== prep.eventoIds.length || pendiente) {
    throw new FalloEtapa("ZOOM", pendiente?.errorIntegracion || "Algún encuentro de la serie todavía no quedó sincronizado con Zoom.");
  }
  let joinUrl: string;
  try {
    joinUrl = (await deps.verificarReunionZoom(reunion.externalId)).joinUrl;
  } catch (error) {
    throw new FalloEtapa("ZOOM", error instanceof Error ? error.message : "No se pudo verificar Zoom.");
  }
  if (!esUrlZoom(joinUrl)) throw new FalloEtapa("ZOOM", "Zoom devolvió un enlace de acceso inválido.", false);
  if (reunion.joinUrl !== joinUrl) {
    await deps.db.reunionProveedor.update({ where: { id: prep.reunionId }, data: { joinUrl } });
  }
  await deps.db.eventoProveedor.updateMany({ where: { id: { in: [...prep.eventoIds] } }, data: { joinUrl } });

  // 2. Calendar: parchea y verifica la cita de cada encuentro, guardando el avance para reanudar.
  //    Un fallo deja a TODA la serie en Meet (el proveedor no se cambia todavía).
  await actualizarCitas(deps, prep, joinUrl);

  // 3. Cambio de proveedor de todos los encuentros en una sola transacción.
  await deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveBloqueoSerieMigracion(serieClave)}))`;
    const cambio = await tx.instanciaSala.updateMany({
      where: {
        id: { in: [...prep.instanciaIds] },
        estado: "PROGRAMADA",
        conservarGoogleMeet: false,
        OR: [{ proveedorActivoTipo: null }, { proveedorActivoTipo: "GOOGLE_MEET" }],
      },
      data: { proveedorActivoTipo: "ZOOM" },
    });
    if (cambio.count !== prep.instanciaIds.length) {
      throw new FalloEtapa("CAMBIO_PROVEEDOR", "Algún encuentro cambió durante la conversión; revisá la serie y reintentá.");
    }
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "MIGRACION_ZOOM_SERIE_APLICADA",
        entidadTipo: "SerieReunion",
        entidadId: serieClave,
        valorAnterior: { proveedorActivoTipo: "GOOGLE_MEET", instanciaIds: [...prep.instanciaIds] },
        valorNuevo: {
          proveedorActivoTipo: "ZOOM",
          reunionProveedorId: prep.reunionId,
          zoomMeetingId: reunion.externalId,
          instanciaIds: [...prep.instanciaIds],
        },
      },
    });
  }).catch((error: unknown) => {
    if (error instanceof FalloEtapa) throw error;
    throw new FalloEtapa("CAMBIO_PROVEEDOR", error instanceof Error ? error.message : "No se pudo cambiar el proveedor activo.");
  });

  // 4. Avisos por serie, solo con el proveedor ya cambiado. Un fallo de correo no revierte nada:
  //    queda en la outbox y se reintenta reaplicando.
  const avisos = await enviarAvisos(deps, serieClave, prep.todasLasInstanciaIds, joinUrl);
  return {
    serieClave,
    resultado: "MIGRADA",
    etapa: "FINAL",
    encuentros: prep.instanciaIds.length,
    reintentable: avisos.estado === "PARCIAL",
    avisos,
  };
}

async function actualizarCitas(deps: DependenciasMigracionZoomSerie, prep: PreparacionSerie, joinUrl: string): Promise<void> {
  const previas = await deps.db.cambioEnlaceCita.findMany({
    where: { reunionProveedorId: prep.reunionId, instanciaSalaId: { in: [...prep.instanciaIds] } },
    select: { id: true, instanciaSalaId: true, enlaceNuevo: true, estado: true },
  });
  const fallos: string[] = [];
  for (const cita of prep.citas) {
    const sinCita = !cita.calendarId || !cita.calendarEventId || !cita.meetJoinUrl;
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
          data: { instanciaSalaId: cita.instanciaId, reunionProveedorId: prep.reunionId, enlaceNuevo: joinUrl, estado: estadoInicial, sinCita },
          select: { id: true, estado: true },
        }));
    if (registro.estado === "VERIFICADA" || sinCita) continue;

    const ref = { calendarId: cita.calendarId!, eventId: cita.calendarEventId! };
    try {
      const actual = await deps.calendar.obtener(ref);
      const cambio = prepararCambioEnlaceCalendarZoom(actual, cita.meetJoinUrl!, joinUrl);
      if (registro.estado !== "PARCHEADA") {
        await deps.calendar.actualizar({ ...ref, cambio });
        await deps.db.cambioEnlaceCita.update({ where: { id: registro.id }, data: { estado: "PARCHEADA" } });
      }
      const verificado = await deps.calendar.obtener(ref);
      const sinMeet = !verificado.conferenceData && !verificado.hangoutLink;
      const conZoom = (verificado.description ?? "").includes(joinUrl);
      const ubicacionIntacta = cambio.location !== undefined
        ? verificado.location === cambio.location
        : verificado.location === actual.location;
      if (!sinMeet || !conZoom || !ubicacionIntacta) throw new Error("Google Calendar no refleja el cambio a Zoom.");
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
  deps: DependenciasMigracionZoomSerie,
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
    }, { serieClave, instanciaIds, tipo: "MIGRACION_SERIE", joinUrl });
  } catch (error) {
    return {
      estado: "PARCIAL", motivo: error instanceof Error ? error.message : "No se pudieron preparar los avisos.",
      destinatarios: 0, enviados: 0, yaEnviados: 0, enCurso: 0, errores: 1, detalle: [],
    };
  }
}
