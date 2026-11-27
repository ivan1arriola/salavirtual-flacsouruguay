/**
 * Sistema visual único de correos transaccionales de Sala Virtual FLACSO.
 *
 * HTML basado en tablas y estilos inline para Gmail móvil, Outlook y webmail.
 * Solo recibe fragmentos HTML ya construidos por código de confianza;
 * TODO texto dinámico debe escaparse con escaparHtmlEmail.
 */
export type VarianteCorreo = "informativo" | "accion" | "alerta" | "seguridad" | "reporte";

export type AccionCorreo = Readonly<{
  texto: string;
  url: string;
}>;

export type LayoutCorreo = Readonly<{
  categoria: string;
  titulo: string;
  resumen: string;
  contenidoHtml: string;
  variante?: VarianteCorreo;
  accion?: AccionCorreo | null;
  nota?: string | null;
  preferenciasUrl?: string | null;
  permiteRespuesta?: boolean;
}>;

const TINTES: Record<VarianteCorreo, string> = {
  informativo: "#22618e",
  accion: "#087f9e",
  alerta: "#aa5718",
  seguridad: "#6c5695",
  reporte: "#216d69",
};

export function escaparHtmlEmail(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function urlHttpSegura(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function botonCorreo(accion: AccionCorreo, variante: VarianteCorreo = "accion"): string {
  const url = urlHttpSegura(accion.url);
  if (!url) {
    return "";
  }
  const acento = TINTES[variante];
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0"><tr>' +
    '<td bgcolor="' +
    acento +
    '" style="border-radius:8px;background:' +
    acento +
    '">' +
    '<a href="' +
    escaparHtmlEmail(url) +
    '" style="display:inline-block;padding:13px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;line-height:20px">' +
    escaparHtmlEmail(accion.texto) +
    "</a></td></tr></table>"
  );
}

export function panelCorreo(contenidoHtml: string, titulo?: string): string {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;margin:0 0 14px;border:1px solid #dce5ee;border-radius:10px;border-collapse:separate;background:#ffffff">' +
    '<tr><td style="padding:17px 18px">' +
    (titulo
      ? '<p style="margin:0 0 12px;color:#183b70;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">' +
        escaparHtmlEmail(titulo) +
        "</p>"
      : "") +
    contenidoHtml +
    "</td></tr></table>"
  );
}

export function envolverCorreo(input: LayoutCorreo): string {
  const variante = input.variante ?? "informativo";
  const acento = TINTES[variante];
  const accionHtml = input.accion
    ? '<div style="margin-top:20px">' + botonCorreo(input.accion, variante) + "</div>"
    : "";
  const noteHtml = input.nota
    ? '<p style="margin:15px 0 0;color:#526277;font-size:12px;line-height:19px">' +
      escaparHtmlEmail(input.nota) +
      "</p>"
    : "";
  const preferencias = input.preferenciasUrl ? urlHttpSegura(input.preferenciasUrl) : null;
  const footerText = input.permiteRespuesta
    ? "Correo automático de Sala Virtual FLACSO. Si encontrás una diferencia, podés responder a este mensaje."
    : "Correo automático de Sala Virtual FLACSO.";
  const prefsHtml = preferencias
    ? '<p style="margin:5px 0 0;font-size:11px;line-height:18px"><a href="' +
      escaparHtmlEmail(preferencias) +
      '" style="color:#087f9e;text-decoration:underline">Administrar preferencias de notificación</a></p>'
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escaparHtmlEmail(input.titulo)}</title>
<style>@media only screen and (max-width:600px){.sv-shell{padding:0!important}.sv-container{border-radius:0!important}.sv-pad{padding:20px 16px!important}.sv-title{font-size:25px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#192b44">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escaparHtmlEmail(input.resumen)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef2f6" style="width:100%;background:#eef2f6">
<tr><td class="sv-shell" align="center" style="padding:22px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sv-container" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border-collapse:separate;overflow:hidden">
<tr><td bgcolor="#183b70" style="padding:18px 22px;border-bottom:3px solid ${acento};background:#183b70">
<p style="margin:0;color:#ffffff;font-size:19px;line-height:25px;font-weight:700">FLACSO Uruguay</p>
<p style="margin:3px 0 0;color:#d6e4f1;font-size:12px;line-height:17px">Sala Virtual &nbsp;/&nbsp; Comunicación institucional</p></td></tr>
<tr><td class="sv-pad" style="padding:26px 28px 10px">
<p style="margin:0 0 9px;color:${acento};font-size:12px;line-height:18px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">${escaparHtmlEmail(input.categoria)}</p>
<h1 class="sv-title" style="margin:0 0 11px;font-size:28px;line-height:1.25;color:#192b44">${escaparHtmlEmail(input.titulo)}</h1>
<p style="margin:0;color:#526277;font-size:15px;line-height:23px">${escaparHtmlEmail(input.resumen)}</p></td></tr>
<tr><td class="sv-pad" style="padding:12px 28px 27px">
${input.contenidoHtml}
${accionHtml}
${noteHtml}
</td></tr>
<tr><td bgcolor="#f7f9fc" style="padding:17px 28px;border-top:1px solid #dce5ee;background:#f7f9fc">
<p style="margin:0;color:#526277;font-size:11px;line-height:18px">${footerText}</p>
${prefsHtml}
</td></tr></table></td></tr></table></body></html>`;
}
