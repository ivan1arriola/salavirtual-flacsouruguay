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
  const preferencesUrl = absoluteUrl(baseUrl, "/mi-perfil");
  const detail = message.emailText && message.emailText.trim() !== message.cuerpo.trim()
    ? message.emailText.trim()
    : null;
  const text = [
    message.titulo,
    "",
    message.cuerpo,
    detail ? `\n${detail}` : null,
    actionUrl ? `\nAbrir en Sala Virtual FLACSO: ${actionUrl}` : null,
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
  preferencesUrl: string;
}>): string {
  const detail = input.detail
    ? `<div style="margin-top:20px;border:1px solid #d8dee8;border-radius:8px;background:#f7f9fb;padding:16px;color:#3f4b5c;font-size:14px;line-height:1.6;white-space:pre-line">${escapeHtml(input.detail)}</div>`
    : "";
  const action = input.actionUrl
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;border-radius:6px;background:#0f6f8f;color:#ffffff;padding:11px 18px;text-decoration:none;font-weight:700">Abrir en el Gestor Meet</a></p>`
    : "";
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f6f8;color:#18212f;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.body)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #d8dee8;border-radius:10px;background:#ffffff;overflow:hidden">
          <tr><td style="border-bottom:4px solid #0f6f8f;padding:20px 24px">
            <strong style="font-size:18px">FLACSO Uruguay</strong><br>
            <span style="color:#647083;font-size:13px">Sala Virtual FLACSO</span>
          </td></tr>
          <tr><td style="padding:28px 24px">
            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">${escapeHtml(input.title)}</h1>
            <p style="margin:0;color:#3f4b5c;font-size:16px;line-height:1.55">${escapeHtml(input.body)}</p>
            ${detail}
            ${action}
          </td></tr>
          <tr><td style="border-top:1px solid #e3e7ed;padding:16px 24px;color:#647083;font-size:12px;line-height:1.5">
            Este mensaje fue enviado automáticamente por Sala Virtual FLACSO.<br>
            <a href="${escapeHtml(input.preferencesUrl)}" style="color:#0f6f8f">Administrar preferencias de notificación</a>
          </td></tr>
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
