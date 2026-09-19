import "server-only";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  crearGoogleAssistantCalendarProvider,
  crearPrismaAssistantCalendarRepository,
  crearServicioCalendarioAsistente,
  type ServicioCalendarioAsistente,
} from "@/src/modules/asistencia/api";

const defaultRepository = crearPrismaAssistantCalendarRepository({
  db,
  descifrar: descifrarConfiguracion,
});

const defaultProvider = crearGoogleAssistantCalendarProvider();

const servicioCalendarioAsistente = crearServicioCalendarioAsistente(
  defaultRepository,
  defaultProvider
);

export function obtenerServicioCalendarioAsistente(): ServicioCalendarioAsistente {
  return servicioCalendarioAsistente;
}

