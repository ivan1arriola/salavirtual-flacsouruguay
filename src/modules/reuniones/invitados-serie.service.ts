import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { ConflictApiError, ForbiddenApiError, NotFoundApiError } from "@/src/lib/http/api-error";
import { construirFiltroSerieSolicitud } from "./serie-reunion.domain";
import { puedeGestionarPrograma } from "./permisos-programa.service";
import { construirCorreoParticipacion, type AvisoEncuentro } from "./avisos-participacion.domain";
import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";

export const invitadosSchema = z.object({
  emails: z.array(z.email().transform((s) => s.trim().toLowerCase())).max(100)
});

type CalendarGuestState = Readonly<{ attendees: readonly { email: string; [key: string]: unknown }[] }>;
export type GuestsDeps = Readonly<{
  db: PrismaClient;
  leerCalendario: (host: string, eventId: string) => Promise<CalendarGuestState>;
  actualizarCalendario: (
    host: string,
    eventId: string,
    attendees: CalendarGuestState["attendees"]
  ) => Promise<void>;
  enviarCorreo: (to: string, message: ReturnType<typeof construirCorreoParticipacion>) => Promise<boolean>;
}>;

export function conciliarInvitadosCalendar(
  previos: CalendarGuestState["attendees"],
  invitadosAnteriores: readonly string[],
  invitadosNuevos: readonly string[]
): CalendarGuestState["attendees"] {
  const removed = new Set(
    invitadosAnteriores.map((email) => email.toLowerCase()).filter((e) => !invitadosNuevos.includes(e))
  );
  const kept = previos.filter((item) => !removed.has(item.email.toLowerCase()));
  const existing = new Set(kept.map((item) => item.email.toLowerCase()));
  return [
    ...kept,
    ...invitadosNuevos.filter((email) => !existing.has(email)).map((email) => ({ email, optional: false }))
  ];
}

export async function actualizarInvitadosSerie(
  deps: GuestsDeps,
  actor: SessionActor,
  solicitudId: string,
  input: unknown
): Promise<
  Readonly<{ encuentros: number; invitados: number; correosEnviados: number; erroresCorreo: number }>
> {
  const { emails: raw } = invitadosSchema.parse(input);
  const emails = [...new Set(raw)];
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
    throw new ForbiddenApiError("Sin permisos para invitar personas.");
  }

  const meetings = await deps.db.instanciaSala.findMany({
    where: {
      solicitud: construirFiltroSerieSolicitud(request),
      estado: "PROGRAMADA",
      inicioProgramadoAt: { gt: new Date() }
    },
    orderBy: { inicioProgramadoAt: "asc" },
    include: {
      invitados: { select: { email: true } },
      cohosts: { select: { cuentaGoogle: { select: { email: true } } } },
      cohostEmails: { select: { email: true } },
      eventosProveedor: {
        include: {
          proveedor: { select: { tipo: true } },
          cuentaProveedor: { select: { emailOrganizador: true } }
        }
      }
    }
  });
  if (!meetings.length) {
    throw new ConflictApiError("No hay encuentros futuros para modificar.");
  }
  // Calendar sigue anclado al evento de Google Meet; solo el enlace enviado a las
  // personas invitadas sigue al proveedor activo.
  const eventoCalendar = (m: (typeof meetings)[number]) =>
    m.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
  const forbidden = new Set(
    meetings.flatMap((m) => [
      ...m.cohosts.map((c) => c.cuentaGoogle.email.toLowerCase()),
      ...m.cohostEmails.map((c) => c.email.toLowerCase()),
      ...m.eventosProveedor
        .filter(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET")
        .flatMap((e) =>
          e.cuentaProveedor?.emailOrganizador ? [e.cuentaProveedor.emailOrganizador.toLowerCase()] : []
        )
    ])
  );
  if (emails.some((email) => forbidden.has(email))) {
    throw new ConflictApiError(
      "Una cuenta anfitriona o coanfitriona no puede agregarse también como invitada."
    );
  }
  const updates: Array<{ host: string; eventId: string; previo: CalendarGuestState["attendees"] }> = [];
  try {
    for (const meeting of meetings) {
      const event = eventoCalendar(meeting);
      const host = event?.cuentaProveedor?.emailOrganizador;
      if (!host || !event?.externalEventId) {
        throw new ConflictApiError("Un encuentro no tiene vinculación completa con Calendar.");
      }
      const current = await deps.leerCalendario(host, event.externalEventId);
      const guestsBefore = meeting.invitados.map((g) => g.email.toLowerCase());
      const updated = conciliarInvitadosCalendar(current.attendees, guestsBefore, emails);
      // Conserva los asistentes añadidos manualmente y los cohosts; solo toca invitados gestionados.
      if (JSON.stringify(current.attendees) !== JSON.stringify(updated)) {
        await deps.actualizarCalendario(host, event.externalEventId, updated);
        updates.push({ host, eventId: event.externalEventId, previo: current.attendees });
      }
    }
  } catch (error) {
    for (const entry of updates.reverse()) {
      try {
        await deps.actualizarCalendario(entry.host, entry.eventId, entry.previo);
      } catch {
        console.error("No fue posible revertir un cambio parcial de invitados en Calendar.");
      }
    }
    throw error;
  }

  try {
    await deps.db.$transaction(async (tx) => {
      for (const meeting of meetings) {
        await tx.invitadoReunion.deleteMany({ where: { instanciaSalaId: meeting.id } });
        if (emails.length) {
          await tx.invitadoReunion.createMany({
            data: emails.map((email) => ({ instanciaSalaId: meeting.id, email }))
          });
        }
      }
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: "INVITADOS_SERIE_ACTUALIZADOS",
          entidadTipo: "SolicitudSala",
          entidadId: solicitudId,
          valorNuevo: { encuentros: meetings.length, invitados: emails.length }
        }
      });
    });
  } catch (error) {
    for (const entry of updates.reverse()) {
      try {
        await deps.actualizarCalendario(entry.host, entry.eventId, entry.previo);
      } catch {
        console.error("No fue posible revertir Calendar después de fallar el guardado de invitados.");
      }
    }
    throw error;
  }
  let correosEnviados = 0;
  let erroresCorreo = 0;
  for (const email of emails) {
    const nuevos = meetings.filter((m) => !m.invitados.some((g) => g.email.toLowerCase() === email));
    if (!nuevos.length) {
      continue;
    }
    const avisos: AvisoEncuentro[] = nuevos.map((m) => {
      const activo = seleccionarEventoProveedorActivo(m);
      return {
        id: m.id,
        titulo: request.titulo,
        inicio: m.inicioProgramadoAt,
        fin: m.finProgramadoAt,
        urlMeet: activo?.joinUrl ?? null,
        proveedor: activo?.proveedor.tipo === "ZOOM" ? "ZOOM" : "GOOGLE_MEET"
      };
    });
    try {
      if (await deps.enviarCorreo(email, construirCorreoParticipacion("INVITACION", avisos, "INVITADO"))) {
        correosEnviados++;
      } else {
        erroresCorreo++;
      }
    } catch {
      erroresCorreo++;
    }
  }
  return { encuentros: meetings.length, invitados: emails.length, correosEnviados, erroresCorreo };
}
