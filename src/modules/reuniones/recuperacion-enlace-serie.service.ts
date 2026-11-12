import { Prisma, type PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { ConflictApiError, ForbiddenApiError, NotFoundApiError } from "@/src/lib/http/api-error";
import { normalizeMeetLink, invalidarVerificacionCohosts } from "@/src/modules/conferencias/api";
import { construirFiltroSerieSolicitud } from "./serie-reunion.domain";
import { puedeGestionarPrograma } from "./permisos-programa.service";
import { construirCorreoParticipacion, type AvisoEncuentro } from "./avisos-participacion.domain";

export type EstadoCalendarRescate = Readonly<{
  description?: string;
  location?: string;
  conferenceData?: unknown;
  hangoutLink?: string;
}>;

export type RescateLinkDeps = Readonly<{
  db: PrismaClient;
  comprobarMeet: (host: string, code: string) => Promise<void>;
  leerCalendario: (host: string, eventId: string) => Promise<EstadoCalendarRescate>;
  reemplazarEnCalendar: (
    host: string,
    eventId: string,
    newUrl: string,
    current: EstadoCalendarRescate
  ) => Promise<EstadoCalendarRescate>;
  restaurarEnCalendar: (host: string, eventId: string, previous: EstadoCalendarRescate) => Promise<void>;
  enviarCorreo: (to: string, message: ReturnType<typeof construirCorreoParticipacion>) => Promise<boolean>;
}>;

export function descripcionConAccesoMeet(description: string | undefined, url: string): string {
  return [
    ...(description ?? "").split("\n").filter((line) => !/^\s*Acceso Google Meet:/i.test(line)),
    "Acceso Google Meet: " + url
  ]
    .join("\n")
    .trim();
}

export async function recuperarEnlaceSerie(
  deps: RescateLinkDeps,
  actor: SessionActor,
  solicitudId: string,
  rawUrl: string
): Promise<
  Readonly<{
    encuentros: number;
    url: string;
    cohostsNotificados: number;
    invitadosNotificados: number;
    erroresCorreo: number;
  }>
> {
  const link = normalizeMeetLink(rawUrl);
  if (!link) {
    throw new ConflictApiError("Ingresá una URL válida de Google Meet.");
  }
  const request = await deps.db.solicitudSala.findUnique({
    where: { id: solicitudId },
    select: {
      id: true,
      serieReunionId: true,
      titulo: true,
      docenteProgramaId: true,
      createdAt: true,
      docentePrograma: { select: { programaId: true } }
    }
  });
  if (!request) {
    throw new NotFoundApiError("La serie no existe.");
  }
  if (!(await puedeGestionarPrograma(deps.db, actor, request.docentePrograma.programaId))) {
    throw new ForbiddenApiError("No tenés permisos para actualizar el enlace de esta serie.");
  }
  const meetings = await deps.db.instanciaSala.findMany({
    where: {
      solicitud: construirFiltroSerieSolicitud(request),
      estado: "PROGRAMADA",
      proveedorActivoTipo: "GOOGLE_MEET",
      conservarGoogleMeet: true,
      inicioProgramadoAt: { gt: new Date() }
    },
    orderBy: { inicioProgramadoAt: "asc" },
    include: {
      invitados: { select: { email: true } },
      cohosts: { select: { cuentaGoogle: { select: { email: true } } } },
      cohostEmails: { select: { email: true } },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: {
          asistenteTecnico: {
            select: {
              usuario: {
                select: {
                  emailPrincipal: true,
                  cuentasGoogle: { select: { email: true } }
                }
              }
            }
          }
        }
      },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        include: { cuentaProveedor: { select: { emailOrganizador: true } } },
        take: 1
      }
    }
  });
  if (!meetings.length) {
    throw new ConflictApiError("No hay encuentros futuros programados para cambiar el enlace.");
  }
  const records = meetings.map((meeting) => {
    const event = meeting.eventosProveedor[0];
    const host = event?.cuentaProveedor?.emailOrganizador;
    if (!event?.externalEventId || !host) {
      throw new ConflictApiError(
        "Todos los encuentros necesitan un evento de Calendar con anfitrión configurado."
      );
    }
    return { meeting, event, host };
  });
  if (records.every(({ event }) => event.joinUrl === link.url)) {
    throw new ConflictApiError("El enlace indicado ya está asignado a todos los encuentros futuros.");
  }
  // No basta con una URL bien formada: Google debe reconocer el espacio.
  for (const host of new Set(records.map((r) => r.host))) {
    await deps.comprobarMeet(host, link.code);
  }

  const patches: Array<{ host: string; eventId: string; before: EstadoCalendarRescate }> = [];
  const calendarResult = new Map<string, EstadoCalendarRescate>();
  try {
    for (const record of records) {
      const eventId = record.event.externalEventId!;
      const before = await deps.leerCalendario(record.host, eventId);
      const changed = await deps.reemplazarEnCalendar(record.host, eventId, link.url, before);
      if (changed.location !== link.url || changed.hangoutLink) {
        throw new ConflictApiError("Google Calendar no confirmó la sustitución completa del enlace de Meet.");
      }
      patches.push({ host: record.host, eventId, before });
      calendarResult.set(record.event.id, changed);
    }
  } catch (error) {
    for (const patch of patches.reverse()) {
      try {
        await deps.restaurarEnCalendar(patch.host, patch.eventId, patch.before);
      } catch {
        console.error(
          "Recuperación Meet: error crítico al revertir Calendar; requiere revisión de operaciones."
        );
      }
    }
    throw error;
  }

  try {
    await deps.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flacso.meet_change_origin', 'recuperar-enlace-serie', true), set_config('flacso.meet_change_reason', 'Enlace alternativo para coanfitriones no verificables', true)`;
      for (const { event } of records) {
        const payload = invalidarVerificacionCohosts(calendarResult.get(event.id));
        await tx.eventoProveedor.update({
          where: { id: event.id },
          data: {
            codigoReunion: link.code,
            joinUrl: link.url,
            payloadUltimo: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
            sincronizadoAt: new Date(),
            estadoIntegracion: "SINCRONIZADA",
            operacionPendiente: null,
            errorIntegracion: null
          }
        });
      }
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: "ENLACE_SERIE_REEMPLAZADO",
          entidadTipo: "SolicitudSala",
          entidadId: solicitudId,
          valorAnterior: { enlaces: [...new Set(records.map(({ event }) => event.joinUrl).filter(Boolean))] },
          valorNuevo: { enlace: link.url, encuentros: records.length, notificaciones: "PENDIENTES" }
        }
      });
    });
  } catch (error) {
    for (const patch of patches.reverse()) {
      try {
        await deps.restaurarEnCalendar(patch.host, patch.eventId, patch.before);
      } catch {
        console.error("No fue posible revertir Calendar después de fallar el guardado del nuevo enlace.");
      }
    }
    throw error;
  }
  // Correos individuales por destinatario; no revelamos la lista de invitados a terceros.
  const destinatarios = new Map<string, { rol: "INVITADO" | "COHOST"; encuentros: AvisoEncuentro[] }>();
  for (const { meeting, host } of records) {
    const aviso: AvisoEncuentro = {
      id: meeting.id,
      titulo: request.titulo,
      inicio: meeting.inicioProgramadoAt,
      fin: meeting.finProgramadoAt,
      urlMeet: link.url
    };
    const cohosts = [
      ...meeting.cohosts.map((c) => c.cuentaGoogle.email),
      ...meeting.cohostEmails.map((c) => c.email),
      ...meeting.asignaciones.flatMap((a) => {
        const u = a.asistenteTecnico.usuario;
        return u.cuentasGoogle.length
          ? u.cuentasGoogle.map((c) => c.email)
          : u.emailPrincipal
            ? [u.emailPrincipal]
            : [];
      })
    ];
    for (const [rol, emails] of [
      ["COHOST", cohosts],
      ["INVITADO", meeting.invitados.map((i) => i.email)]
    ] as const) {
      for (const value of emails) {
        const email = value.trim().toLowerCase();
        if (!email || email === host.toLowerCase()) {
          continue;
        }
        const previous = destinatarios.get(email);
        if (previous) {
          if (rol === "COHOST") {
            previous.rol = "COHOST";
          }
          if (!previous.encuentros.some((item) => item.id === aviso.id)) {
            previous.encuentros.push(aviso);
          }
        } else {
          destinatarios.set(email, { rol, encuentros: [aviso] });
        }
      }
    }
  }
  let cohostsNotificados = 0,
    invitadosNotificados = 0,
    erroresCorreo = 0;
  for (const [email, { rol, encuentros }] of destinatarios) {
    try {
      const accepted = await deps.enviarCorreo(
        email,
        construirCorreoParticipacion("ENLACE_CAMBIADO", encuentros, rol)
      );
      if (accepted) {
        if (rol === "COHOST") {
          cohostsNotificados++;
        } else {
          invitadosNotificados++;
        }
      } else {
        erroresCorreo++;
      }
    } catch {
      erroresCorreo++;
    }
  }
  await deps.db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "ENLACE_SERIE_AVISOS_RESULTADO",
      entidadTipo: "SolicitudSala",
      entidadId: solicitudId,
      valorNuevo: { cohostsNotificados, invitadosNotificados, erroresCorreo }
    }
  });
  return {
    encuentros: records.length,
    url: link.url,
    cohostsNotificados,
    invitadosNotificados,
    erroresCorreo
  };
}
