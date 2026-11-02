import {
  envolverCorreo,
  escaparHtmlEmail,
  panelCorreo,
  urlHttpSegura,
  type VarianteCorreo
} from "@/src/lib/email/email-design-system";

import type {
  NotificationEmail,
  NotificationMessage,
  ReunionEmailInput,
} from "./notificaciones.types";

export function construirCorreoNotificacion(
  message: NotificationMessage,
  baseUrl: string
): NotificationEmail {
  const subject = message.emailSubject ?? message.titulo;
  const actionUrl = message.href ? absoluteUrl(baseUrl, message.href) : null;
  const actionLabel = message.emailActionLabel ?? "Abrir Sala Virtual FLACSO";
  const preferencesUrl = absoluteUrl(baseUrl, "/mi-perfil");
  const detail =
    message.emailText && message.emailText.trim() !== message.cuerpo.trim()
      ? message.emailText.trim()
      : null;

  const text = [
    message.titulo,
    "",
    message.cuerpo,
    detail ? `\n${detail}` : null,
    actionUrl ? `\n${actionLabel}: ${actionUrl}` : null,
    "",
    `Preferencias de notificación: ${preferencesUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject,
    text,
    html:
      message.emailHtml ??
      envolverCorreo({
        categoria: categoriaNotificacion(message.tipo),
        titulo: message.titulo,
        resumen: message.cuerpo,
        variante: varianteNotificacion(message.tipo),
        contenidoHtml: detail ? renderDetailHtml(detail, message.tipo) : "",
        accion: actionUrl ? { texto: actionLabel, url: actionUrl } : undefined,
        preferenciasUrl: preferencesUrl,
      }),
  };
}

export function reunionEmailText(input: ReunionEmailInput): string {
  const todosZoom = input.instancias.length > 0 && input.instancias.every(({ proveedor }) => proveedor === "ZOOM");
  const nombreProveedor = todosZoom ? "Zoom" : "Google Meet";
  const headerLines = [
    "DATOS DE LA REUNIÓN",
    `Reunión: ${input.titulo}`,
    input.programa ? `Programa: ${input.programa}` : null,
    input.docente ? `Docente/responsable: ${input.docente}` : null,
    input.modalidad ? `Modalidad: ${input.modalidad}` : null,
    `Monitoreo: ${input.requiereAsistenciaTecnica ? "requerido" : "no requerido"}`,
    `Grabación: ${input.requiereGrabacion ? "requerida" : "no requerida"}`,
    input.anfitrionDesignado ? `Anfitrión designado: ${input.anfitrionDesignado}` : null,
    input.asistenteTecnico ? `Asistente de monitoreo: ${input.asistenteTecnico}` : null,
    "",
    input.instancias.length === 1 ? "ENCUENTRO" : "ENCUENTROS",
  ].filter((line): line is string => line !== null);

  const instanciaLines = input.instancias.flatMap((item, index) => {
    return [
      `${index + 1}. ${item.inicio} – ${item.fin}`,
      item.sala ? `   Sala: ${item.sala}` : null,
      item.password ? `   Contraseña: ${item.password}` : null,
      item.meet ? `   ${item.proveedor === "ZOOM" ? "ID de Zoom" : "Código de Meet"}: ${item.meet}` : null,
      item.joinUrl ? `   Acceso: ${item.joinUrl}` : null,
      index < input.instancias.length - 1 ? "" : null,
    ].filter((line): line is string => line !== null);
  });

  const asistenciaText = input.requiereAsistenciaTecnica
    ? input.asistenteTecnico
      ? `• Monitoreo: asignado a ${input.asistenteTecnico}. La persona asignada al monitoreo ingresará como anfitrión/co-anfitrión para brindar soporte y moderar la sesión.`
      : "• Monitoreo: la reunión requiere monitoreo (pendiente de asignación). Quien sea designado/a como asistente de monitoreo ingresará como anfitrión/co-anfitrión de la sesión."
    : `• Monitoreo: no requerido. Quien solicitó la reunión y el/la docente o anfitrión designado cuentan con permisos de anfitrión en ${nombreProveedor}.`;

  const footerLines = todosZoom
    ? [
        "",
        "¿CÓMO ACCEDER A LA REUNIÓN?",
        "• Ingresen al enlace de Zoom indicado para cada encuentro. No es necesario iniciar sesión con la cuenta de la sala.",
        "• Anfitriones y docentes: ingresen con el mismo enlace de Zoom; ante dudas sobre permisos de anfitrión, consulten a Administración.",
        "• Participantes y estudiantes: ingresan directamente a través del enlace de Zoom provisto.",
        asistenciaText,
      ]
    : [
        "",
        "¿CÓMO ACCEDER A LA REUNIÓN?",
        "• No es necesario iniciar sesión con la cuenta de la sala ni usar su contraseña.",
        "• Anfitriones y docentes: ingresen al enlace de Google Meet directamente con su cuenta de Google asignada. Google Meet les otorgará automáticamente permisos de co-anfitrión (co-host) para iniciar la sesión, admitir participantes y gestionar la grabación.",
        "• Participantes y estudiantes: ingresan directamente a través del enlace de Google Meet provisto.",
        asistenciaText,
      ];

  return [...headerLines, ...instanciaLines, ...footerLines].join("\n");
}

function absoluteUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

function categoriaNotificacion(tipo: NotificationMessage["tipo"]): string {
  switch (tipo) {
    case "REUNION_CREADA": return "Reuniones";
    case "REUNION_RECORDATORIO": return "Recordatorio de reunión";
    case "ASISTENCIA_REQUERIDA": return "Cobertura de monitoreo";
    case "ASISTENCIA_ASIGNACION": return "Monitoreo asignado";
    case "ASISTENCIA_POSTULACION": return "Postulaciones";
    case "ASISTENCIA_POSTULACION_RETIRADA": return "Postulaciones";
    case "CREDENCIALES_SALA_CAMBIADAS": return "Acceso a salas";
    case "HOST_NO_CONECTADO": return "Alerta operativa";
  }
}

function varianteNotificacion(tipo: NotificationMessage["tipo"]): VarianteCorreo {
  switch (tipo) {
    case "ASISTENCIA_REQUERIDA":
    case "ASISTENCIA_ASIGNACION":
      return "accion";
    case "HOST_NO_CONECTADO":
      return "alerta";
    case "CREDENCIALES_SALA_CAMBIADAS":
      return "seguridad";
    default:
      return "informativo";
  }
}

function escapeHtml(value: string): string {
  return escaparHtmlEmail(value);
}

function renderDetailHtml(rawDetail: string, tipo: NotificationMessage["tipo"]): string {
  const sections = rawDetail.split(
    /(?=\n\n(?:¿CÓMO ACCEDER|INSTRUCCIONES DE ACCESO|INSTRUCCIONES PARA))/i
  );
  const main = sections[0]?.trim();
  const access = sections.slice(1).join("\n\n").trim();
  const detailTitle = tipo === "REUNION_CREADA" ? "Información de la reunión"
    : tipo === "ASISTENCIA_REQUERIDA" ? "Cobertura solicitada"
    : tipo === "ASISTENCIA_ASIGNACION" ? "Detalles del monitoreo"
    : tipo === "CREDENCIALES_SALA_CAMBIADAS" ? "Datos de acceso"
    : tipo === "HOST_NO_CONECTADO" ? "Detalles de la alerta"
    : "Detalles de la notificación";
  const mainMarkup = main ? panelCorreo(renderStructuredLines(main), detailTitle) : "";
  if (!access) return mainMarkup;
  return mainMarkup +
    '<div style="margin-top:13px;border:1px solid #bce2ee;border-left:5px solid #167e9f;border-radius:10px;background:#f0f8fb;padding:17px 18px">' +
    '<p style="margin:0 0 11px;color:#183b70;font-size:13px;font-weight:700">¿Cómo acceder?</p>' +
    renderStructuredLines(access) +
    '</div>';
}

function renderStructuredLines(raw: string): string {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const heading = /^(DATOS DE LA REUNIÓN|ENCUENTRO(?:S)?|¿CÓMO ACCEDER A LA REUNIÓN\?|INSTRUCCIONES DE ACCESO|INSTRUCCIONES PARA.*)$/.test(line);
    if (heading) {
      return '<p style="margin:14px 0 7px;font-size:11px;letter-spacing:.04em;font-weight:700;text-transform:uppercase;color:#183b70">' +
        escapeHtml(line) + '</p>';
    }
    const matched = line.match(/^(?:•\s*)?([\p{L}\s/()]+):\s*(.*)$/u);
    if (matched && matched[1].length < 38) {
      return '<p style="margin:0 0 9px;font-size:13px;line-height:20px;color:#526277">' +
        '<strong style="color:#192b44">' + escapeHtml(matched[1].trim()) + ':</strong> ' +
        linkifyEscaped(escapeHtml(matched[2])) + '</p>';
    }
    const isNumbered = /^\d+\.\s/.test(line);
    return '<p style="margin:' + (isNumbered ? '14px 0 7px' : '0 0 9px') +
      ';font-size:13px;line-height:21px;color:#33465c' +
      (isNumbered ? ';font-weight:700' : '') + '">' + linkifyEscaped(escapeHtml(line)) + '</p>';
  }).join("");
}

function linkifyEscaped(escapedText: string): string {
  return escapedText.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const url = urlHttpSegura(match);
    if (!url) return match;
    return '<a href="' + escaparHtmlEmail(url) +
      '" style="color:#087f9e;text-decoration:underline;overflow-wrap:anywhere" target="_blank" rel="noopener noreferrer">' +
      match + '</a>';
  });
}
