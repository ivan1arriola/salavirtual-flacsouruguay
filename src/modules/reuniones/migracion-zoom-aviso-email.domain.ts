import { botonCorreo, envolverCorreo, escaparHtmlEmail, panelCorreo } from "@/src/lib/email/email-design-system";

export type DatosAvisoMigracionZoom = Readonly<{
  nombre?: string | null;
  reunion: string;
  programa?: string | null;
  fecha: string;
  horario: string;
  /** join_url real de Zoom. Nunca el start_url del anfitrión. */
  urlZoom: string;
}>;

export function esUrlZoom(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "zoom.us" || u.hostname.endsWith(".zoom.us"));
  } catch {
    return false;
  }
}

/** Aviso individual: la reunión pasó de Google Meet a Zoom y este es el enlace vigente. */
export function construirAvisoMigracionZoom(input: DatosAvisoMigracionZoom): Readonly<{ subject: string; text: string; html: string }> {
  const e = escaparHtmlEmail;
  const saludo = input.nombre?.trim() ? "Hola " + input.nombre.trim() + "," : "Hola,";
  const text = [
    "Cambio de plataforma: tu reunión ahora es por Zoom",
    "",
    saludo,
    "La reunión " + input.reunion + (input.programa ? " — " + input.programa : "") +
      " dejó de realizarse por Google Meet y ahora se realizará por Zoom.",
    "Fecha: " + input.fecha,
    "Horario: " + input.horario,
    "",
    "Enlace de Zoom: " + input.urlZoom,
    "Usá el enlace de Zoom para participar en este encuentro.",
  ].join("\n");

  const detalles = panelCorreo(
    '<p style="margin:0 0 6px;color:#192b44;font-size:18px;line-height:26px;font-weight:700">' + e(input.reunion) + '</p>' +
    (input.programa ? '<p style="margin:0 0 14px;color:#526277;font-size:13px;line-height:20px">' + e(input.programa) + '</p>' : "") +
    '<p style="margin:0 0 4px;color:#183b70;font-size:14px;font-weight:700">' + e(input.fecha) + '</p>' +
    '<p style="margin:0;color:#192b44;font-size:20px;line-height:28px;font-weight:700">' + e(input.horario) + '</p>',
    "Fecha y horario · Uruguay"
  );
  const html = envolverCorreo({
    categoria: "Cambio de plataforma",
    titulo: "Tu reunión ahora es por Zoom",
    resumen: "La reunión " + input.reunion + " se realizará por Zoom. Usá el nuevo enlace.",
    variante: "accion",
    contenidoHtml: detalles +
      '<div style="margin:15px 0">' + botonCorreo({ texto: "Ingresar a Zoom", url: input.urlZoom }) + '</div>',
    nota: "Usá el enlace de Zoom para este encuentro. Fecha y horario no cambian.",
    preferenciasUrl: null
  });
  return { subject: "Cambio a Zoom: " + input.reunion + " · Sala Virtual FLACSO", text, html };
}
