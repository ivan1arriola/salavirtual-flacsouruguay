import { envolverCorreo } from "@/src/lib/email/email-design-system";

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
  const saludo = input.nombre?.trim() ? "Hola, " + escapar(input.nombre.trim()) + "." : "Hola.";
  const tarjetas = input.reuniones.map((reunion, index) => tarjeta(reunion, index, input.variante)).join("");
  return envolverCorreo({
    categoria: asignadas ? "Cronograma personal" : "Coberturas disponibles",
    titulo,
    resumen,
    variante: "accion",
    contenidoHtml: '<p style="margin:0 0 17px;color:#526277;font-size:14px;line-height:22px">' +
      saludo + ' ' + escapar(descripcion) + '</p>' + tarjetas,
    accion: { texto: etiquetaBoton, url: destino },
    nota: asignadas
      ? "Los cambios en asignaciones y horarios se actualizan en Mi Agenda."
      : "Postularte no confirma la asignación. La confirmación aparece en Mi Agenda.",
    preferenciasUrl: "https://salavirtual.flacso.edu.uy/mi-perfil"
  });
}
