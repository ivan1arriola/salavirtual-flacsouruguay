import {
  envolverCorreo,
  panelCorreo,
  botonCorreo,
  escaparHtmlEmail,
} from "@/src/lib/email/email-design-system";
import { formatLongDate, formatTime } from "@/src/lib/ui/format";

export type AvisoEncuentro = Readonly<{
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  urlMeet: string | null;
  /** Proveedor del enlace; por omisión Google Meet. */
  proveedor?: "GOOGLE_MEET" | "ZOOM";
}>;

export function construirCorreoParticipacion(
  tipo: "INVITACION" | "ENLACE_CAMBIADO" | "RECORDATORIO",
  encuentros: readonly AvisoEncuentro[],
  rol: "INVITADO" | "COHOST",
): Readonly<{ subject: string; text: string; html: string }> {
  const todosZoom =
    encuentros.length > 0 && encuentros.every(({ proveedor }) => proveedor === "ZOOM");
  const titulo =
    tipo === "INVITACION"
      ? "Invitación a reuniones de FLACSO"
      : tipo === "RECORDATORIO"
        ? "Recordatorio de tu próxima reunión"
        : "Cambió el enlace de tus reuniones";
  const intro =
    tipo === "INVITACION"
      ? "Te invitamos a participar de los próximos encuentros de FLACSO Uruguay."
      : tipo === "RECORDATORIO"
        ? "Tu reunión se realizará dentro de las próximas 24 horas. Revisá el horario y el enlace de acceso."
        : "Se actualizó el enlace de " +
          (todosZoom ? "Zoom" : "Google Meet") +
          " para los encuentros futuros de esta serie. Utilizá el nuevo acceso.";
  const etiquetas =
    rol === "COHOST"
      ? "Se te incluye como coanfitrión. Los permisos efectivos deben confirmarse en " +
        (todosZoom ? "Zoom" : "Google Meet") +
        "."
      : "Participás como invitado; esta invitación no te concede permisos de coanfitrión.";
  const filas = encuentros
    .map((meeting) => {
      const time = formatTime(meeting.inicio) + "–" + formatTime(meeting.fin) + " h (Uruguay)";
      return panelCorreo(
        '<h2 style="font-size:16px;line-height:23px;color:#192b44;margin:0 0 8px">' +
          escaparHtmlEmail(meeting.titulo) +
          "</h2>" +
          '<p style="margin:0 0 10px;color:#526277;font-size:13px">' +
          escaparHtmlEmail(formatLongDate(meeting.inicio)) +
          " · " +
          escaparHtmlEmail(time) +
          "</p>" +
          (meeting.urlMeet
            ? botonCorreo({
                texto: meeting.proveedor === "ZOOM" ? "Abrir Zoom" : "Abrir Google Meet",
                url: meeting.urlMeet,
              })
            : '<p style="color:#995218;font-size:12px">Enlace todavía no disponible.</p>'),
      );
    })
    .join("");
  const lines = encuentros.map((m) =>
    [
      m.titulo,
      formatLongDate(m.inicio) + " " + formatTime(m.inicio) + "–" + formatTime(m.fin) + " h UY",
      m.urlMeet ?? "Enlace pendiente",
    ].join("\n"),
  );
  return {
    subject: titulo + " · Sala Virtual FLACSO",
    text: [titulo, intro, etiquetas, ...lines].join("\n\n"),
    html: envolverCorreo({
      categoria: rol === "COHOST" ? "Coanfitriones" : "Invitados",
      titulo,
      resumen: intro,
      variante: "accion",
      contenidoHtml:
        '<p style="margin:0 0 16px;color:#526277;font-size:13px;line-height:21px">' +
        escaparHtmlEmail(etiquetas) +
        "</p>" +
        filas,
      nota: "Si se modifican las reuniones, consultá el último aviso o contactá con FLACSO Uruguay.",
    }),
  };
}
