import "server-only";
import { db } from "@/src/lib/db";
import { obtenerConfiguracionCorreoSesActiva } from "@/src/modules/configuracion/correo-ses.service";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearPrismaNotificacionesRepository,
  crearServicioNotificaciones,
  crearSmtpEmailTransport,
  crearSesV2EmailTransport,
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
const defaultSesTransport = crearSesV2EmailTransport(() => obtenerConfiguracionCorreoSesActiva(db));

const defaultCompositeTransport = crearCompositeEmailTransport(
  defaultGmailTransport,
  defaultSmtpTransport,
  defaultSesTransport
);

const servicioNotificaciones = crearServicioNotificaciones(
  defaultRepository,
  defaultCompositeTransport
);

export function obtenerServicioNotificaciones(): ServicioNotificaciones {
  return servicioNotificaciones;
}

