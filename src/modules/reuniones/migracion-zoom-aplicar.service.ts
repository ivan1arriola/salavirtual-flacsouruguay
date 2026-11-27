import type { Prisma, PrismaClient } from "@prisma/client";
import { ForbiddenApiError, ValidationApiError } from "@/src/lib/http/api-error";
import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";
import { CUENTA_ZOOM_ASIGNABLE } from "./cuenta-asignable.domain";
import { prepararCambioEnlaceCalendarZoom } from "./migracion-zoom-calendar.domain";
import {
  meetPreparadoParaMigracion,
  planificarMigracionZoom,
} from "./migracion-zoom-preview.domain";
import { bloquearReservaSalas } from "./reserva-salas.adapter";
import { construirFiltroSerieSolicitud } from "./serie-reunion.domain";
import { esUrlZoom } from "./migracion-zoom-aviso-email.domain";
import {
  notificarMigracionZoom,
  type EnviarCorreoMigracion,
  type ResumenAvisosMigracion,
} from "./migracion-zoom-avisos.service";

type Actor = Readonly<{ id: string; rol: string }>;

export const MARGEN_SEGURIDAD_HORAS_APLICAR = 24;
export const MAXIMO_LOTE_MIGRACION_ZOOM = 10;

export type ModoMigracionZoom = "PILOTO" | "LOTE";

export type EventoCalendarMigracion = Readonly<{
  description?: string;
  location?: string;
  hangoutLink?: string;
  conferenceData?: unknown;
  attendees?: readonly Readonly<{ email: string }>[];
}>;

/** Puertos externos: Zoom (provisión existente + verificación) y Google Calendar. */
export type DependenciasMigracionZoom = Readonly<{
  db: PrismaClient;
  /** Provisión Zoom existente (reutiliza el externalEventId persistido). */
  sincronizarEventos: (
    ids: readonly string[],
  ) => Promise<readonly Readonly<{ estado: string; error?: string }>[]>;
  /** GET real a Zoom; devuelve el join_url vigente. */
  verificarReunionZoom: (meetingId: string) => Promise<Readonly<{ joinUrl: string }>>;
  calendar: Readonly<{
    obtener: (
      input: Readonly<{ calendarId: string; eventId: string }>,
    ) => Promise<EventoCalendarMigracion>;
    /** PATCH con conferenceDataVersion=1 y sendUpdates=none. */
    actualizar: (
      input: Readonly<{
        calendarId: string;
        eventId: string;
        cambio: Readonly<Record<string, unknown>>;
      }>,
    ) => Promise<void>;
  }>;
  /** Transporte de correo para los avisos posteriores al cambio. Sin él no se avisa. */
  enviarCorreo?: EnviarCorreoMigracion;
  ahora?: () => Date;
}>;

export type ResultadoMigracionInstancia = Readonly<{
  instanciaId: string;
  resultado: "MIGRADA" | "YA_ZOOM" | "OMITIDA" | "ERROR";
  etapa: "VALIDACION" | "ZOOM" | "CALENDAR" | "CAMBIO_PROVEEDOR" | "FINAL";
  mensaje?: string;
  reintentable: boolean;
  /** Resultado de los avisos por correo; solo existe tras un cambio efectivo a Zoom. */
  avisos?: ResumenAvisosMigracion;
}>;

class FalloEtapa extends Error {
  constructor(
    public readonly etapa: ResultadoMigracionInstancia["etapa"],
    message: string,
    public readonly reintentable = true,
    public readonly omitida = false,
  ) {
    super(message);
  }
}

const lockKey = (instanciaId: string) => `flacso-meet:migracion-zoom:${instanciaId}`;

const seleccionInstancia = {
  id: true,
  estado: true,
  inicioProgramadoAt: true,
  finProgramadoAt: true,
  proveedorActivoTipo: true,
  conservarGoogleMeet: true,
  solicitud: {
    select: { serieReunionId: true, docenteProgramaId: true, titulo: true, createdAt: true },
  },
  eventosProveedor: {
    select: {
      id: true,
      externalEventId: true,
      joinUrl: true,
      estadoIntegracion: true,
      operacionPendiente: true,
      cuentaProveedorId: true,
      cuentaProveedor: { select: { emailOrganizador: true } },
      proveedor: { select: { tipo: true } },
    },
  },
} satisfies Prisma.InstanciaSalaSelect;

/**
 * Convierte encuentros futuros de Meet a Zoom. Solo Administración. Cada
 * encuentro es independiente e idempotente: reintentar retoma desde la última
 * etapa completada sin crear una segunda reunión Zoom.
 */
export async function aplicarMigracionZoom(
  deps: DependenciasMigracionZoom,
  actor: Actor,
  input: Readonly<{ modo: ModoMigracionZoom; instanciaIds: readonly string[] }>,
): Promise<readonly ResultadoMigracionInstancia[]> {
  if (actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede aplicar la migración a Zoom.");
  }
  const ids = [...new Set(input.instanciaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new ValidationApiError("Indicá al menos un encuentro.");
  }
  if (input.modo === "PILOTO" && ids.length !== 1) {
    throw new ValidationApiError("El piloto convierte exactamente un encuentro.");
  }
  if (ids.length > MAXIMO_LOTE_MIGRACION_ZOOM) {
    throw new ValidationApiError(`Un lote admite hasta ${MAXIMO_LOTE_MIGRACION_ZOOM} encuentros.`);
  }

  const resultados: ResultadoMigracionInstancia[] = [];
  for (const instanciaId of ids) {
    try {
      resultados.push(await migrarInstancia(deps, actor, instanciaId));
    } catch (error) {
      if (error instanceof FalloEtapa) {
        resultados.push({
          instanciaId,
          resultado: error.omitida ? "OMITIDA" : "ERROR",
          etapa: error.etapa,
          mensaje: error.message,
          reintentable: error.reintentable,
        });
      } else {
        resultados.push({
          instanciaId,
          resultado: "ERROR",
          etapa: "FINAL",
          mensaje: error instanceof Error ? error.message : "Error inesperado.",
          reintentable: true,
        });
      }
    }
  }
  return resultados;
}

type PreparacionMigracion = Readonly<{
  yaZoom: boolean;
  zoomEventoId: string;
  calendarId: string;
  calendarEventId: string;
  meetJoinUrl: string;
  meetEventoId: string;
}>;

/** Revalida bajo bloqueo y deja la fila Zoom lista (pendiente o reanudable). */
async function prepararBajoBloqueo(
  deps: DependenciasMigracionZoom,
  instanciaId: string,
): Promise<PreparacionMigracion> {
  const ahora = (deps.ahora ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(instanciaId)}))`;
    const instancia = await tx.instanciaSala.findUnique({
      where: { id: instanciaId },
      select: seleccionInstancia,
    });
    if (!instancia) {
      throw new FalloEtapa("VALIDACION", "El encuentro no existe.", false, true);
    }

    const meet = instancia.eventosProveedor.find(
      ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET",
    );
    const zoom = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM");
    const activo = seleccionarEventoProveedorActivo(instancia)?.proveedor.tipo ?? null;

    if (activo === "ZOOM") {
      if (!zoom) {
        throw new FalloEtapa(
          "VALIDACION",
          "El proveedor activo es Zoom pero falta su evento.",
          false,
        );
      }
      return {
        yaZoom: true,
        zoomEventoId: zoom.id,
        calendarId: "",
        calendarEventId: "",
        meetJoinUrl: "",
        meetEventoId: meet?.id ?? "",
      };
    }
    if (
      !meet ||
      !meet.joinUrl ||
      !meet.externalEventId ||
      !meet.cuentaProveedor?.emailOrganizador
    ) {
      throw new FalloEtapa(
        "VALIDACION",
        "El evento Meet no tiene calendario, evento o enlace verificables.",
        false,
        true,
      );
    }

    const proveedorZoom = await tx.proveedorReunion.findUnique({ where: { tipo: "ZOOM" } });
    if (!proveedorZoom) {
      throw new FalloEtapa("VALIDACION", "El proveedor Zoom no está configurado.", false);
    }
    await bloquearReservaSalas(tx, proveedorZoom.id);

    // Reutiliza el planificador de la vista previa. Al reanudar, el host ya
    // elegido queda fijo y su propia reserva no cuenta como colisión.
    const hostsDb = await tx.cuentaProveedor.findMany({
      where: { ...CUENTA_ZOOM_ASIGNABLE, proveedor: { tipo: "ZOOM" } },
      orderBy: [{ prioridad: "asc" }, { id: "asc" }],
      select: { id: true, emailOrganizador: true, prioridad: true, limiteConcurrente: true },
    });
    const hosts = zoom?.cuentaProveedorId
      ? hostsDb.filter(({ id }) => id === zoom.cuentaProveedorId)
      : hostsDb;
    const emailMeet = meet.cuentaProveedor.emailOrganizador.trim().toLowerCase();
    const cuentaZoomPreferidaId =
      hosts.find((host) => host.emailOrganizador?.trim().toLowerCase() === emailMeet)?.id ?? null;
    // Una serie de Meet comparte un solo enlace; migrar un encuentro por separado le daría uno distinto.
    const encuentrosSerie = await tx.instanciaSala.count({
      where: {
        estado: "PROGRAMADA",
        inicioProgramadoAt: { gt: ahora },
        solicitud: construirFiltroSerieSolicitud(instancia.solicitud),
      },
    });
    const reservas = await tx.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "ZOOM" },
        cuentaProveedorId: { not: null },
        instanciaSalaId: { not: instanciaId },
        instancia: { estado: { in: ["PROGRAMADA", "EN_CURSO"] }, finProgramadoAt: { gt: ahora } },
      },
      select: {
        cuentaProveedorId: true,
        instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } },
      },
    });
    const [fila] = planificarMigracionZoom({
      ahora,
      margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS_APLICAR,
      hosts: hosts.map((host) => ({ ...host, limiteConcurrente: 1 })),
      reservasZoom: reservas.flatMap(({ cuentaProveedorId, instancia: i }) =>
        cuentaProveedorId
          ? [{ cuentaProveedorId, inicio: i.inicioProgramadoAt, fin: i.finProgramadoAt }]
          : [],
      ),
      candidatos: [
        {
          id: instancia.id,
          inicio: instancia.inicioProgramadoAt,
          fin: instancia.finProgramadoAt,
          estado: instancia.estado,
          proveedorActivo: activo === "GOOGLE_MEET" ? "GOOGLE_MEET" : null,
          conservarGoogleMeet: instancia.conservarGoogleMeet,
          meetPreparado: meetPreparadoParaMigracion({
            ...meet,
            emailOrganizador: meet.cuentaProveedor?.emailOrganizador ?? null,
          }),
          meetJoinUrl: meet.joinUrl,
          cuentaZoomPreferidaId,
          zoomSincronizado: false,
          encuentrosSerie,
        },
      ],
    });
    if (fila?.estado === "SERIE") {
      throw new FalloEtapa(
        "VALIDACION",
        "La serie tiene varios encuentros: la migración debe hacerse por serie completa y todavía no está disponible.",
        false,
        true,
      );
    }
    if (fila?.estado !== "MIGRABLE" || !fila.hostId) {
      throw new FalloEtapa(
        "VALIDACION",
        `El encuentro ya no es migrable (${fila?.estado ?? "sin datos"}).`,
        false,
        true,
      );
    }

    let zoomEventoId: string;
    if (zoom) {
      zoomEventoId = zoom.id;
      const completo =
        zoom.estadoIntegracion === "SINCRONIZADA" &&
        zoom.externalEventId &&
        zoom.joinUrl &&
        !zoom.operacionPendiente;
      if (!completo && !zoom.operacionPendiente) {
        // Conserva externalEventId: la reanudación consulta la reunión existente.
        await tx.eventoProveedor.update({
          where: { id: zoom.id },
          data: {
            operacionPendiente: "PROVISIONAR",
            estadoIntegracion: "PENDIENTE",
            errorIntegracion: null,
          },
        });
      }
    } else {
      const creado = await tx.eventoProveedor.create({
        data: {
          instanciaSalaId: instanciaId,
          proveedorId: proveedorZoom.id,
          cuentaProveedorId: fila.hostId,
          operacionPendiente: "PROVISIONAR",
        },
        select: { id: true },
      });
      zoomEventoId = creado.id;
    }

    return {
      yaZoom: false,
      zoomEventoId,
      calendarId: meet.cuentaProveedor.emailOrganizador,
      calendarEventId: meet.externalEventId,
      meetJoinUrl: meet.joinUrl,
      meetEventoId: meet.id,
    };
  });
}

async function migrarInstancia(
  deps: DependenciasMigracionZoom,
  actor: Actor,
  instanciaId: string,
): Promise<ResultadoMigracionInstancia> {
  const prep = await prepararBajoBloqueo(deps, instanciaId);
  if (prep.yaZoom) {
    // Reintento tras un cambio hecho por esta migración: completa solo los avisos
    // pendientes. Un encuentro que nació en Zoom (sin auditoría) no recibe aviso.
    const migrado = await deps.db.auditoria.findFirst({
      where: {
        accion: "MIGRACION_ZOOM_APLICADA",
        entidadTipo: "InstanciaSala",
        entidadId: instanciaId,
      },
      select: { id: true },
    });
    if (!migrado) {
      return { instanciaId, resultado: "YA_ZOOM", etapa: "FINAL", reintentable: false };
    }
    const avisos = await enviarAvisos(deps, instanciaId);
    return {
      instanciaId,
      resultado: "YA_ZOOM",
      etapa: "FINAL",
      reintentable: avisos.estado === "PARCIAL",
      avisos,
    };
  }

  // 1. Zoom: provisión existente; reutiliza el ID externo persistido.
  try {
    await deps.sincronizarEventos([prep.zoomEventoId]);
  } catch (error) {
    throw new FalloEtapa(
      "ZOOM",
      error instanceof Error ? error.message : "Falló la provisión de Zoom.",
    );
  }
  const zoom = await deps.db.eventoProveedor.findUnique({
    where: { id: prep.zoomEventoId },
    select: {
      externalEventId: true,
      joinUrl: true,
      estadoIntegracion: true,
      operacionPendiente: true,
      errorIntegracion: true,
    },
  });
  if (
    !zoom ||
    zoom.estadoIntegracion !== "SINCRONIZADA" ||
    zoom.operacionPendiente ||
    !zoom.externalEventId
  ) {
    throw new FalloEtapa(
      "ZOOM",
      zoom?.errorIntegracion || "La reunión Zoom todavía no quedó sincronizada.",
    );
  }
  let joinUrl: string;
  try {
    joinUrl = (await deps.verificarReunionZoom(zoom.externalEventId)).joinUrl;
  } catch (error) {
    throw new FalloEtapa(
      "ZOOM",
      error instanceof Error ? error.message : "No se pudo verificar Zoom.",
    );
  }
  if (!esUrlZoom(joinUrl)) {
    throw new FalloEtapa("ZOOM", "Zoom devolvió un enlace de acceso inválido.", false);
  }
  if (zoom.joinUrl !== joinUrl) {
    await deps.db.eventoProveedor.update({ where: { id: prep.zoomEventoId }, data: { joinUrl } });
  }

  // 2. Calendar: parchea el evento existente y verifica con GET.
  //    Un fallo aquí deja Meet activo (el proveedor no se cambia todavía).
  const ref = { calendarId: prep.calendarId, eventId: prep.calendarEventId };
  try {
    const actual = await deps.calendar.obtener(ref);
    const cambio = prepararCambioEnlaceCalendarZoom(actual, prep.meetJoinUrl, joinUrl);
    await deps.calendar.actualizar({ ...ref, cambio });
    const verificado = await deps.calendar.obtener(ref);
    const sinMeet = !verificado.conferenceData && !verificado.hangoutLink;
    const conZoom = (verificado.description ?? "").includes(joinUrl);
    const ubicacionIntacta =
      cambio.location !== undefined
        ? verificado.location === cambio.location
        : verificado.location === actual.location;
    if (!sinMeet || !conZoom || !ubicacionIntacta) {
      throw new Error("Google Calendar no refleja el cambio a Zoom.");
    }
  } catch (error) {
    throw new FalloEtapa(
      "CALENDAR",
      error instanceof Error ? error.message : "Falló la actualización de Google Calendar.",
    );
  }

  // 3. Cambio de proveedor activo, solo tras Calendar verificado. No se toca
  //    el EventoProveedor Meet ni el espacio Meet (puede ser compartido).
  await deps.db
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(instanciaId)}))`;
      const cambio = await tx.instanciaSala.updateMany({
        where: {
          id: instanciaId,
          estado: "PROGRAMADA",
          conservarGoogleMeet: false,
          OR: [{ proveedorActivoTipo: null }, { proveedorActivoTipo: "GOOGLE_MEET" }],
        },
        data: { proveedorActivoTipo: "ZOOM" },
      });
      if (cambio.count !== 1) {
        throw new FalloEtapa(
          "CAMBIO_PROVEEDOR",
          "El encuentro cambió durante la conversión; revisá Calendar y reintentá.",
        );
      }
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: "MIGRACION_ZOOM_APLICADA",
          entidadTipo: "InstanciaSala",
          entidadId: instanciaId,
          valorAnterior: {
            proveedorActivoTipo: "GOOGLE_MEET",
            meetEventoProveedorId: prep.meetEventoId,
          },
          valorNuevo: {
            proveedorActivoTipo: "ZOOM",
            zoomEventoProveedorId: prep.zoomEventoId,
            zoomMeetingId: zoom.externalEventId,
          },
        },
      });
    })
    .catch((error: unknown) => {
      throw new FalloEtapa(
        "CAMBIO_PROVEEDOR",
        error instanceof Error ? error.message : "No se pudo cambiar el proveedor activo.",
      );
    });

  // 4. Avisos individuales, solo con el proveedor ya cambiado. Un fallo de correo
  //    no revierte la migración: queda en la outbox y se reintenta reaplicando.
  const avisos = await enviarAvisos(deps, instanciaId);
  return {
    instanciaId,
    resultado: "MIGRADA",
    etapa: "FINAL",
    reintentable: avisos.estado === "PARCIAL",
    avisos,
  };
}

async function enviarAvisos(
  deps: DependenciasMigracionZoom,
  instanciaId: string,
): Promise<ResumenAvisosMigracion> {
  if (!deps.enviarCorreo) {
    return {
      estado: "NO_CONFIGURADO",
      motivo: "No hay transporte de correo configurado.",
      destinatarios: 0,
      enviados: 0,
      yaEnviados: 0,
      enCurso: 0,
      errores: 0,
      detalle: [],
    };
  }
  try {
    return await notificarMigracionZoom(
      {
        db: deps.db,
        enviarCorreo: deps.enviarCorreo,
        leerInvitadosCalendar: async (calendarId, eventId) =>
          (await deps.calendar.obtener({ calendarId, eventId })).attendees?.map(
            ({ email }) => email,
          ) ?? [],
        ahora: deps.ahora,
      },
      instanciaId,
    );
  } catch (error) {
    return {
      estado: "PARCIAL",
      motivo: error instanceof Error ? error.message : "No se pudieron preparar los avisos.",
      destinatarios: 0,
      enviados: 0,
      yaEnviados: 0,
      enCurso: 0,
      errores: 1,
      detalle: [],
    };
  }
}
