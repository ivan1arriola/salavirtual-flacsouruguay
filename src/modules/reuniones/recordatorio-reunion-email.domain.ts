import {
  botonCorreo,
  envolverCorreo,
  escaparHtmlEmail,
  panelCorreo,
} from "@/src/lib/email/email-design-system";

export type EstadoVerificacionMeet = "CONFIRMADO" | "SIN_PERMISOS" | "NO_VERIFICABLE";

export type AccesoRecordatorio = Readonly<{
  estado: EstadoVerificacionMeet;
  cuentasConfirmadas: readonly string[];
  cuentasSinPermiso: readonly string[];
}>;

export type DatosRecordatorio = Readonly<{
  nombre: string;
  reunion: string;
  programa: string;
  fecha: string;
  horarioClase: string;
  horarioMonitoreo?: string | null;
  modalidad: string;
  urlMeet?: string | null;
  /** Proveedor del enlace; Zoom no tiene verificación de coanfitriones de Meet. */
  proveedor?: "GOOGLE_MEET" | "ZOOM";
  urlDetalle: string;
  acceso: AccesoRecordatorio;
}>;

function construirRecordatorioZoom(
  input: DatosRecordatorio,
): Readonly<{ subject: string; text: string; html: string }> {
  const e = escaparHtmlEmail;
  const text = [
    "Recordatorio: tu próxima reunión",
    "",
    "Hola " + input.nombre + ",",
    input.reunion + " — " + input.programa,
    "Fecha: " + input.fecha,
    "Horario de clase: " + input.horarioClase,
    input.horarioMonitoreo ? "Horario de monitoreo: " + input.horarioMonitoreo : null,
    "Modalidad: " + input.modalidad,
    "",
    input.urlMeet
      ? "Enlace de Zoom: " + input.urlMeet
      : "El enlace de Zoom todavía no está disponible.",
    "Revisá la reunión en " + input.urlDetalle,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const detalles = panelCorreo(
    '<p style="margin:0 0 6px;color:#192b44;font-size:18px;line-height:26px;font-weight:700">' +
      e(input.reunion) +
      "</p>" +
      '<p style="margin:0 0 14px;color:#526277;font-size:13px;line-height:20px">' +
      e(input.programa) +
      "</p>" +
      '<p style="margin:0 0 4px;color:#183b70;font-size:14px;font-weight:700">' +
      e(input.fecha) +
      "</p>" +
      '<p style="margin:0 0 5px;color:#192b44;font-size:20px;line-height:28px;font-weight:700">' +
      e(input.horarioClase) +
      "</p>" +
      (input.horarioMonitoreo
        ? '<p style="margin:5px 0;color:#526277;font-size:13px">Monitoreo: <strong>' +
          e(input.horarioMonitoreo) +
          "</strong></p>"
        : "") +
      '<p style="margin:8px 0 0;color:#526277;font-size:13px">' +
      e(input.modalidad) +
      "</p>",
    "Fecha y horario · Uruguay",
  );
  const zoom = input.urlMeet
    ? '<div style="margin:15px 0">' +
      botonCorreo({ texto: "Ingresar a Zoom", url: input.urlMeet }) +
      "</div>"
    : '<p style="color:#995218;font-size:13px">El enlace de Zoom todavía no está disponible.</p>';
  const html = envolverCorreo({
    categoria: "Recordatorio de reunión",
    titulo: "Tu próxima reunión",
    resumen: "Hola, " + input.nombre + ". Revisá el horario y el enlace de acceso.",
    variante: "accion",
    contenidoHtml: detalles + zoom,
    accion: { texto: "Ver detalle de la reunión", url: input.urlDetalle },
    nota: "Si el horario cambia, consultá la agenda actualizada.",
    preferenciasUrl: "https://salavirtual.flacso.edu.uy/mi-perfil",
  });
  return { subject: "Recordatorio: " + input.reunion + " · Sala Virtual FLACSO", text, html };
}

export function construirRecordatorioReunion(
  input: DatosRecordatorio,
): Readonly<{ subject: string; text: string; html: string }> {
  if (input.proveedor === "ZOOM") {
    return construirRecordatorioZoom(input);
  }
  const e = escaparHtmlEmail;
  const confirmadas = input.acceso.cuentasConfirmadas;
  const sinPermiso = input.acceso.cuentasSinPermiso;
  const textAcceso =
    input.acceso.estado === "NO_VERIFICABLE"
      ? "Google Meet no permitió comprobar los permisos antes del envío. No hay cuentas verificadas para esta reunión."
      : confirmadas.length
        ? "Cuentas verificadas como coanfitrión en Google Meet:\n" +
          confirmadas.map((email) => "- " + email).join("\n")
        : "Google Meet no confirmó ninguna de tus cuentas como coanfitrión para esta reunión.";
  const text = [
    "Recordatorio: tu próxima reunión",
    "",
    "Hola " + input.nombre + ",",
    input.reunion + " — " + input.programa,
    "Fecha: " + input.fecha,
    "Horario de clase: " + input.horarioClase,
    input.horarioMonitoreo ? "Horario de monitoreo: " + input.horarioMonitoreo : null,
    "Modalidad: " + input.modalidad,
    "",
    textAcceso,
    sinPermiso.length
      ? "Cuentas sin permisos de coanfitrión confirmados: " + sinPermiso.join(", ")
      : null,
    input.urlMeet
      ? "Enlace de Google Meet: " + input.urlMeet
      : "El enlace de Google Meet todavía no está disponible.",
    "Revisá la reunión en " + input.urlDetalle,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const accesoHtml =
    input.acceso.estado === "NO_VERIFICABLE"
      ? '<p style="margin:0;color:#995218;font-size:13px;line-height:21px"><strong>No pudimos verificar los accesos con la API de Google Meet.</strong> No asumas que tus cuentas tienen permisos de coanfitrión; consultá a Administración.</p>'
      : confirmadas.length
        ? '<p style="margin:0 0 10px;color:#236448;font-size:13px;font-weight:700">Verificadas en Google Meet como coanfitrión</p>' +
          confirmadas
            .map(
              (email) =>
                '<p style="margin:0 0 6px;color:#192b44;font-size:13px;overflow-wrap:anywhere">' +
                e(email) +
                "</p>",
            )
            .join("")
        : '<p style="margin:0;color:#995218;font-size:13px;line-height:21px"><strong>Ninguna de tus cuentas figura como coanfitrión.</strong> Podrías ingresar como participante, pero no se confirmaron permisos para conducir la reunión.</p>';
  const advertencia =
    sinPermiso.length && input.acceso.estado !== "NO_VERIFICABLE"
      ? '<p style="margin:11px 0 0;color:#995218;font-size:12px;line-height:19px">Sin permiso de coanfitrión confirmado: ' +
        sinPermiso.map(e).join(", ") +
        "</p>"
      : "";

  const detalles = panelCorreo(
    '<p style="margin:0 0 6px;color:#192b44;font-size:18px;line-height:26px;font-weight:700">' +
      e(input.reunion) +
      "</p>" +
      '<p style="margin:0 0 14px;color:#526277;font-size:13px;line-height:20px">' +
      e(input.programa) +
      "</p>" +
      '<p style="margin:0 0 4px;color:#183b70;font-size:14px;font-weight:700">' +
      e(input.fecha) +
      "</p>" +
      '<p style="margin:0 0 5px;color:#192b44;font-size:20px;line-height:28px;font-weight:700">' +
      e(input.horarioClase) +
      "</p>" +
      (input.horarioMonitoreo
        ? '<p style="margin:5px 0;color:#526277;font-size:13px">Monitoreo: <strong>' +
          e(input.horarioMonitoreo) +
          "</strong></p>"
        : "") +
      '<p style="margin:8px 0 0;color:#526277;font-size:13px">' +
      e(input.modalidad) +
      "</p>",
    "Fecha y horario · Uruguay",
  );
  const meet = input.urlMeet
    ? '<div style="margin:15px 0">' +
      botonCorreo({ texto: "Ingresar a Google Meet", url: input.urlMeet }) +
      "</div>"
    : '<p style="color:#995218;font-size:13px">El enlace de Meet todavía no está disponible.</p>';

  const html = envolverCorreo({
    categoria: "Recordatorio de reunión",
    titulo: "Tu próxima reunión",
    resumen:
      "Hola, " +
      input.nombre +
      ". Revisá el horario, el enlace y las cuentas habilitadas para conducir la reunión.",
    variante: "accion",
    contenidoHtml:
      detalles +
      panelCorreo(accesoHtml + advertencia, "Cuentas de acceso verificadas con Google Meet") +
      meet,
    accion: { texto: "Ver detalle de la reunión", url: input.urlDetalle },
    nota: "La verificación se realizó antes del envío. Solo las cuentas confirmadas por la API aparecen como coanfitrionas. Si el horario cambia, consultá la agenda actualizada.",
    preferenciasUrl: "https://salavirtual.flacso.edu.uy/mi-perfil",
  });
  return { subject: "Recordatorio: " + input.reunion + " · Sala Virtual FLACSO", text, html };
}
