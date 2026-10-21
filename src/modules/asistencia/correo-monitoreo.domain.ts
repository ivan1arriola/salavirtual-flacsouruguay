export type ReunionResumenMonitoreo = Readonly<{
  fecha: string;
  titulo: string;
  inicioMonitoreo: string;
  finMonitoreo: string;
  inicioClase: string;
  finClase: string;
  modalidad: string;
  programa: string;
  docente: string;
  meetUrl?: string | null;
}>;

export type ResumenMonitoreoEmailInput = Readonly<{
  variante: "asignadas" | "disponibles";
  reuniones: readonly ReunionResumenMonitoreo[];
  nombre?: string | null;
}>;

const COLOR = {
  navy: "#183b70",
  teal: "#087f9e",
  ink: "#192b44",
  muted: "#506278",
  border: "#dce5ee"
} as const;

function escapar(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function enlaceMeetValido(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "meet.google.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

function boton(url: string, label: string, secondary = false): string {
  const color = secondary ? COLOR.navy : COLOR.teal;
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    '<td bgcolor="' + color + '" style="border-radius:8px;background:' + color + '">',
    '<a href="' + escapar(url) + '" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;line-height:20px">',
    escapar(label),
    '</a></td></tr></table>'
  ].join("");
}

function tarjeta(reunion: ReunionResumenMonitoreo, index: number, variante: ResumenMonitoreoEmailInput["variante"]): string {
  const meet = variante === "asignadas" ? enlaceMeetValido(reunion.meetUrl) : null;
  const titulo = escapar(reunion.titulo);
  const fecha = escapar(reunion.fecha);
  const modalidad = escapar(reunion.modalidad);
  const horario = escapar(reunion.inicioMonitoreo + "–" + reunion.finMonitoreo);
  const horarioClase = escapar(reunion.inicioClase + "–" + reunion.finClase);
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px;border:1px solid ' + COLOR.border + ';border-radius:10px;border-collapse:separate;background:#ffffff">',
    '<tr><td style="padding:18px 18px 16px">',
    '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.07em;color:' + COLOR.navy + ';text-transform:uppercase">',
    'REUNIÓN ' + String(index + 1).padStart(2, "0") + ' &nbsp;·&nbsp; ' + fecha,
    '</p>',
    '<h2 style="margin:0 0 14px;font-size:18px;line-height:1.35;color:' + COLOR.ink + ';font-weight:700">' + titulo + '</h2>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:13px;background:#f0f6fa;border-radius:8px">',
    '<tr><td style="padding:12px 14px">',
    '<span style="font-size:11px;line-height:16px;font-weight:700;color:' + COLOR.muted + ';text-transform:uppercase;letter-spacing:0.04em">Horario de monitoreo · Uruguay</span>',
    '<div style="margin:3px 0 5px;font-size:21px;line-height:26px;font-weight:700;color:' + COLOR.navy + '">' + horario + ' h</div>',
    '<div style="font-size:12px;line-height:19px;color:' + COLOR.muted + '">Clase: ' + horarioClase + ' h &nbsp;·&nbsp; ' + modalidad + '</div>',
    '</td></tr></table>',
    '<p style="margin:0 0 4px;color:' + COLOR.muted + ';font-size:13px;line-height:1.5"><strong style="color:' + COLOR.ink + '">Programa:</strong> ' + escapar(reunion.programa) + '</p>',
    '<p style="margin:0;color:' + COLOR.muted + ';font-size:13px;line-height:1.5"><strong style="color:' + COLOR.ink + '">Docente:</strong> ' + escapar(reunion.docente) + '</p>',
    meet ? '<div style="padding-top:14px">' + boton(meet, "Ingresar a Google Meet", true) + '</div>' : '',
    '</td></tr></table>'
  ].join("");
}

/**
 * Correo HTML de resúmenes masivos. Tablas e estilos en línea mantienen la
 * legibilidad en Gmail móvil, Outlook y clientes que eliminan CSS externo.
 * No altera el texto alternativo ni el flujo de notificaciones.
 */
export function construirHtmlResumenMonitoreo(input: ResumenMonitoreoEmailInput): string {
  const asignadas = input.variante === "asignadas";
  const cantidad = input.reuniones.length;
  const titulo = asignadas ? "Tus monitoreos asignados" : "Reuniones que necesitan monitoreo";
  const resumen = asignadas
    ? "Tenés " + cantidad + (cantidad === 1 ? " reunión asignada." : " reuniones asignadas.")
    : "Hay " + cantidad + (cantidad === 1 ? " reunión disponible para postularte." : " reuniones disponibles para postularte.");
  const descripcion = asignadas
    ? "Este es tu próximo cronograma. Revisá las fechas y accedé a cada reunión desde el enlace correspondiente."
    : "Estas reuniones todavía no tienen una persona asignada. Revisá los horarios y postuláte desde Agenda Abierta.";
  const destino = asignadas ? "https://salavirtual.flacso.edu.uy/mi-agenda" : "https://salavirtual.flacso.edu.uy/agenda-abierta";
  const etiquetaBoton = asignadas ? "Abrir Mi Agenda" : "Ver Agenda Abierta";
  const nombre = input.nombre?.trim();
  const saludo = nombre ? "Hola, " + escapar(nombre) + "." : "Hola.";
  const tarjetas = input.reuniones.map((reunion, index) => tarjeta(reunion, index, input.variante)).join("");
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    '<title>' + escapar(titulo) + '</title>',
    '<style>@media only screen and (max-width:600px){.sv-shell{padding:0!important}.sv-container{border-radius:0!important}.sv-pad{padding:20px 16px!important}.sv-title{font-size:25px!important}}</style>',
    '</head><body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:' + COLOR.ink + '">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">' + escapar(resumen) + '</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef2f6" style="width:100%;background:#eef2f6"><tr><td align="center" class="sv-shell" style="padding:22px 10px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sv-container" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border-collapse:separate;overflow:hidden">',
    '<tr><td bgcolor="' + COLOR.navy + '" style="padding:18px 22px;border-bottom:3px solid ' + COLOR.teal + ';background:' + COLOR.navy + '">',
    '<p style="margin:0;color:#ffffff;font-size:19px;line-height:25px;font-weight:700">FLACSO Uruguay</p>',
    '<p style="margin:3px 0 0;color:#d6e4f1;font-size:12px;line-height:17px">Sala Virtual &nbsp;/&nbsp; Notificaciones de monitoreo</p>',
    '</td></tr>',
    '<tr><td class="sv-pad" style="padding:26px 28px 12px">',
    '<p style="margin:0 0 10px;color:' + COLOR.teal + ';font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">' + (asignadas ? "CRONOGRAMA PERSONAL" : "COBERTURAS DISPONIBLES") + '</p>',
    '<h1 class="sv-title" style="margin:0 0 10px;font-size:29px;line-height:1.22;letter-spacing:-0.02em;color:' + COLOR.ink + '">' + escapar(titulo) + '</h1>',
    '<p style="margin:0 0 8px;color:' + COLOR.ink + ';font-size:16px;line-height:24px;font-weight:700">' + escapar(resumen) + '</p>',
    '<p style="margin:0;color:' + COLOR.muted + ';font-size:14px;line-height:22px">' + saludo + ' ' + escapar(descripcion) + '</p>',
    '</td></tr>',
    '<tr><td class="sv-pad" style="padding:12px 28px 14px">' + tarjetas + '</td></tr>',
    '<tr><td class="sv-pad" style="padding:4px 28px 28px">',
    boton(destino, etiquetaBoton),
    '<p style="margin:13px 0 0;color:' + COLOR.muted + ';font-size:12px;line-height:19px">',
    asignadas ? "Los cambios en asignaciones y horarios se actualizan en Mi Agenda." : "Postularte no confirma la asignación. La confirmación aparece en Mi Agenda.",
    '</p></td></tr>',
    '<tr><td bgcolor="#f7f9fc" style="padding:17px 28px;border-top:1px solid ' + COLOR.border + ';background:#f7f9fc">',
    '<p style="margin:0;color:' + COLOR.muted + ';font-size:11px;line-height:18px">Correo automático de Sala Virtual FLACSO. No necesitás responder este mensaje.</p>',
    '<p style="margin:5px 0 0;font-size:11px;line-height:18px"><a href="https://salavirtual.flacso.edu.uy/mi-perfil" style="color:' + COLOR.teal + ';text-decoration:underline">Administrar preferencias de notificación</a></p>',
    '</td></tr></table></td></tr></table></body></html>'
  ].join("");
}
