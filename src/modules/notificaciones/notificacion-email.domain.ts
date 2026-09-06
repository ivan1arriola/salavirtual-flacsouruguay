import type { NotificationMessage } from "./notificaciones.service";

export type NotificationEmail = Readonly<{
  subject: string;
  text: string;
  html: string;
}>;

export function construirCorreoNotificacion(
  message: NotificationMessage,
  baseUrl: string
): NotificationEmail {
  const subject = message.emailSubject ?? message.titulo;
  const actionUrl = message.href ? absoluteUrl(baseUrl, message.href) : null;
  const actionLabel = message.emailActionLabel ?? "Abrir Sala Virtual FLACSO";
  const preferencesUrl = absoluteUrl(baseUrl, "/mi-perfil");
  const detail = message.emailText && message.emailText.trim() !== message.cuerpo.trim()
    ? message.emailText.trim()
    : null;
  const text = [
    message.titulo,
    "",
    message.cuerpo,
    detail ? `\n${detail}` : null,
    actionUrl ? `\n${actionLabel}: ${actionUrl}` : null,
    "",
    `Preferencias de notificación: ${preferencesUrl}`
  ].filter((line): line is string => line !== null).join("\n");

  return {
    subject,
    text,
    html: message.emailHtml ?? htmlTemplate({
      title: message.titulo,
      body: message.cuerpo,
      detail,
      actionUrl,
      actionLabel,
      preferencesUrl
    })
  };
}

function absoluteUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

function htmlTemplate(input: Readonly<{
  title: string;
  body: string;
  detail: string | null;
  actionUrl: string | null;
  actionLabel: string;
  preferencesUrl: string;
}>): string {
  const detail = input.detail ? renderDetailHtml(input.detail) : "";
  const action = input.actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td bgcolor="#167e9f" style="border-radius:8px"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(input.actionLabel)}</a></td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f6;color:#172033;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.body)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eef2f6" style="width:100%;background:#eef2f6;padding:24px 10px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #d8e0ea;border-radius:14px;overflow:hidden">
          <tr>
            <td bgcolor="#163970" style="background:#163970;padding:22px 26px;border-bottom:5px solid #1c86a8">
              <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.2">FLACSO Uruguay</div>
              <div style="margin-top:4px;color:#d8e7f5;font-size:13px;line-height:1.3">Sala Virtual FLACSO</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 26px 28px">
              <h1 style="margin:0 0 12px;color:#172033;font-size:26px;line-height:1.25">${escapeHtml(input.title)}</h1>
              <p style="margin:0;color:#4b5870;font-size:16px;line-height:1.6">${escapeHtml(input.body)}</p>
              ${detail}
              ${action}
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e2e7ee;padding:18px 26px;color:#6a7485;font-size:12px;line-height:1.6">
              Este mensaje fue enviado automáticamente por Sala Virtual FLACSO.<br>
              <a href="${escapeHtml(input.preferencesUrl)}" style="color:#167e9f;text-decoration:underline">Administrar preferencias de notificación</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDetailHtml(rawDetail: string): string {
  const parts = rawDetail.split(/(?=\n\n(?:¿CÓMO ACCEDER|INSTRUCCIONES DE ACCESO|INSTRUCCIONES PARA))/i);
  if (parts.length > 1) {
    const mainInfo = parts[0].trim();
    const accessInfo = parts.slice(1).join("\n\n").trim();
    return `
<div style="margin-top:24px;border:1px solid #d7dee8;border-radius:12px;background:#f7f9fc;padding:20px;color:#27364a;font-size:14px;line-height:1.7;white-space:pre-line;word-break:break-word">
  <div style="margin-bottom:10px;color:#163970;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Información de la reunión</div>
  ${linkifyEscaped(escapeHtml(mainInfo))}
</div>
<div style="margin-top:16px;border:1px solid #bce2ee;border-left:5px solid #167e9f;border-radius:12px;background:#f0f8fb;padding:20px;color:#163970;font-size:14px;line-height:1.7;white-space:pre-line;word-break:break-word">
  <div style="margin-bottom:10px;color:#163970;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">¿Cómo acceder?</div>
  ${linkifyEscaped(escapeHtml(accessInfo))}
</div>`.trim();
  }

  return `<div style="margin-top:24px;border:1px solid #d7dee8;border-radius:12px;background:#f7f9fc;padding:20px;color:#27364a;font-size:14px;line-height:1.7;white-space:pre-line;word-break:break-word"><div style="margin-bottom:10px;color:#163970;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Información de la reunión</div>${linkifyEscaped(escapeHtml(rawDetail))}</div>`;
}

function linkifyEscaped(escapedText: string): string {
  return escapedText.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#167e9f;text-decoration:underline;font-weight:600" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

