import "server-only";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  crearGoogleAssistantCalendarProvider,
  crearPrismaAsistenciaRepositoryAdapter,
  crearPrismaAssistantCalendarRepository,
  crearServicioAsistencia,
  crearServicioCalendarioAsistente,
  type AsistenciaRepositoryPort,
  type ServicioAsistencia,
  type ServicioCalendarioAsistente
} from "@/src/modules/asistencia/api";
import { notificarUsuarios } from "@/src/modules/notificaciones/notificaciones.service";
import type { SessionActor } from "@/src/modules/asistencia/api";
import { sincronizarCohostsDeInstancia } from "@/src/modules/asistencia/asistencia.service";
import { sincronizarCalendarioAsistenteInstancia } from "@/src/modules/asistencia/calendario-asistente.service";
import { intentarSincronizacionCalendarioAsistente } from "@/src/modules/asistencia/calendario-asistente-safe.service";
import { eliminarEventoCalendarioAsistente, publicarEventoCalendarioAsistente } from "@/src/modules/asistencia/calendario-asistente-google.adapter";
import { configurarGoogleMeetExistente } from "@/src/modules/conferencias/api";

const defaultCalendarRepository = crearPrismaAssistantCalendarRepository({
  db,
  descifrar: descifrarConfiguracion
});

const defaultCalendarProvider = crearGoogleAssistantCalendarProvider();

const servicioCalendarioAsistente = crearServicioCalendarioAsistente(
  defaultCalendarRepository,
  defaultCalendarProvider
);

export function obtenerServicioCalendarioAsistente(): ServicioCalendarioAsistente {
  return servicioCalendarioAsistente;
}

export function crearAsistenciaRepository(): AsistenciaRepositoryPort {
  return crearPrismaAsistenciaRepositoryAdapter(db);
}

export function obtenerServicioAsistencia(): ServicioAsistencia {
  return crearServicioAsistencia({
    repo: crearAsistenciaRepository(),
    notificarUsuarios: async (input) => {
      await notificarUsuarios(
        db,
        input.usuarioIds.map((id) => ({ usuarioId: id })),
        {
          tipo: "ASISTENCIA_REQUERIDA",
          titulo: input.asunto,
          cuerpo: input.mensaje,
          href: "/agenda-abierta",
          emailSubject: input.asunto,
          emailText: input.mensaje
        }
      );
    }
  });
}

export function asignarAsistente(actor: SessionActor, input: unknown) {
  return obtenerServicioAsistencia().asignarAsistente(actor, input);
}

export function desvincularAsistente(actor: SessionActor, input: unknown) {
  return obtenerServicioAsistencia().desvincularAsistente(actor, input);
}

export function reportarDuracionAsistencia(actor: SessionActor, input: unknown, ahora?: Date) {
  return obtenerServicioAsistencia().reportarDuracion(actor, input, ahora);
}

export async function sincronizarAsignacionAsistente(instanciaSalaId: string, calendarWarning: string) {
  const warnings: string[] = [];
  try {
    await sincronizarCohostsDeInstancia({ db, descifrar: descifrarConfiguracion, configurarEspacio: configurarGoogleMeetExistente }, instanciaSalaId);
  } catch (error) {
    console.error("Falló la sincronización de cohosts de asistencia técnica.", error);
    warnings.push("La sincronización de cohosts con Google Meet está pendiente.");
  }
  const intento = await intentarSincronizacionCalendarioAsistente(() =>
    sincronizarCalendarioAsistenteInstancia({ db, descifrar: descifrarConfiguracion, publicarEvento: publicarEventoCalendarioAsistente, eliminarEvento: eliminarEventoCalendarioAsistente }, instanciaSalaId)
  );
  if (intento.error || intento.resultados.some((resultado) => resultado.estado === "ERROR")) warnings.push(calendarWarning);
  return { calendarioAsistente: intento.resultados, warning: warnings.length ? warnings.join(" ") : null };
}
