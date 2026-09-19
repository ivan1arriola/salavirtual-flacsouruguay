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
