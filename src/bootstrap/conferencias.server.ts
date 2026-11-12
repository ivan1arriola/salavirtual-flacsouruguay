import "server-only";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  crearGoogleConferenceProvider,
  crearPrismaConferenciasRepository,
  crearServicioConferencias,
  type ServicioConferencias
} from "@/src/modules/conferencias/api";

let servicioConferenciasSingleton: ServicioConferencias | null = null;

export function obtenerServicioConferencias(): ServicioConferencias {
  if (!servicioConferenciasSingleton) {
    const repository = crearPrismaConferenciasRepository({
      db,
      descifrarConfiguracion
    });
    servicioConferenciasSingleton = crearServicioConferencias(repository, crearGoogleConferenceProvider);
  }
  return servicioConferenciasSingleton;
}
