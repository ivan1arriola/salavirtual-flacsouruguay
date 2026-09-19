import "server-only";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearPrismaNotificacionesRepository,
  crearServicioNotificaciones,
  crearSmtpEmailTransport,
  type ServicioNotificaciones,
} from "@/src/modules/notificaciones/api";

const defaultRepository = crearPrismaNotificacionesRepository({
  db,
  descifrar: descifrarConfiguracion,
});

const defaultGmailTransport = crearGmailEmailTransport(() =>
  defaultRepository.obtenerCredencialesGmail()
);

const defaultSmtpTransport = crearSmtpEmailTransport();

const defaultCompositeTransport = crearCompositeEmailTransport(
  defaultGmailTransport,
  defaultSmtpTransport
);

const servicioNotificaciones = crearServicioNotificaciones(
  defaultRepository,
  defaultCompositeTransport
);

export function obtenerServicioNotificaciones(): ServicioNotificaciones {
  return servicioNotificaciones;
}

