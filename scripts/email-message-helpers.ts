export const timezone = "America/Montevideo";

const dateFormatter = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: timezone
});

const timeFormatter = new Intl.DateTimeFormat("es-UY", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: timezone
});

export type CuentaSala = Readonly<{
  nombre: string;
  emailOrganizador: string | null;
  secretRef: string | null;
}> | null | undefined;

export type EmailMessage = Readonly<{
  text: string;
  html: string;
}>;

export type MeetingEmailCard = Readonly<{
  titulo: string;
  programa: string;
  docente?: string;
  modalidad: string;
  fechas: readonly string[];
  joinUrl?: string | null;
  codigoReunion?: string | null;
  usuarioSala?: string | null;
  passwordSala?: string | null;
  observaciones: readonly string[];
  estadoAsignacion?: string;
}>;

export function formatRange(inicio: Date, fin: Date): string {
  return `${capitalize(dateFormatter.format(inicio))}, ${timeFormatter.format(inicio)} a ${timeFormatter.format(fin)} h`;
}

export function fullName(
  persona: Readonly<{ nombres: string; apellidos?: string | null }>
): string {
  return [persona.nombres, persona.apellidos].filter(Boolean).join(" ");
}

export function firstName(persona: Readonly<{ nombres: string }>): string {
  return persona.nombres.replace(/,+$/, "");
}

export function passwordSala(
  cuenta: CuentaSala,
  descifrar: (value: string) => string
): string | null {
  if (!cuenta?.secretRef) return null;
  try {
    return descifrar(cuenta.secretRef);
  } catch {
    return null;
  }
}

export function buildMeetingDigestEmail(input: Readonly<{
  greetingName: string;
  intro: string;
  cards: readonly MeetingEmailCard[];
  footer?: string;
}>): EmailMessage {
  const footer = input.footer ?? "Equipo FLACSO Uruguay";
  const textCards = input.cards.map((card, index) => {
    const dateDetails =
      card.fechas.length === 1
        ? [`   Fecha: ${card.fechas[0]}`]
        : ["   Fechas:", ...card.fechas.map((fecha) => `   - ${fecha}`)];
    const details = [
      `${index + 1}. ${card.titulo}`,
      `   Programa: ${card.programa}`,
      card.docente ? `   Docente: ${card.docente}` : null,
      `   Modalidad: ${card.modalidad}`,
      card.estadoAsignacion ? `   Estado de asignación: ${card.estadoAsignacion}` : null,
      ...dateDetails,
      card.joinUrl ? `   Link: ${card.joinUrl}` : "   Link: pendiente de provisión",
      card.codigoReunion ? `   Código Meet: ${card.codigoReunion}` : null,
      card.usuarioSala ? `   Usuario sala: ${card.usuarioSala}` : null,
      card.passwordSala ? `   Contraseña sala: ${card.passwordSala}` : null,
      card.observaciones.length ? `   Observaciones: ${card.observaciones.join("; ")}` : null
    ];
    return details.filter(Boolean).join("\n");
  });

  const text = [
    `Hola ${input.greetingName},`,
    "",
    input.intro,
    "",
    textCards.join("\n\n"),
    "",
    "Saludos,",
    footer
  ].join("\n");

  const htmlCards = input.cards.map((card) => `
    <section style="border:1px solid #d8e0ea;border-radius:8px;padding:18px 20px;margin:0 0 16px;background:#ffffff;">
      <h2 style="margin:0 0 6px;font-size:18px;line-height:1.3;color:#1b365d;">${escapeHtml(card.titulo)}</h2>
      <p style="margin:0 0 14px;color:#4b5563;font-size:14px;">${escapeHtml(card.programa)} · ${escapeHtml(card.modalidad)}</p>
      ${card.docente ? `<p style="margin:0 0 12px;font-size:14px;"><strong>Docente:</strong> ${escapeHtml(card.docente)}</p>` : ""}
      ${card.estadoAsignacion ? `<p style="margin:0 0 12px;font-size:14px;"><strong>Estado:</strong> ${escapeHtml(card.estadoAsignacion)}</p>` : ""}
      <div style="margin:0 0 14px;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827;">${card.fechas.length === 1 ? "Fecha" : "Fechas"}</p>
        <ul style="margin:0;padding-left:20px;color:#111827;font-size:14px;line-height:1.55;">
          ${card.fechas.map((fecha) => `<li>${escapeHtml(fecha)}</li>`).join("")}
        </ul>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        ${detailRow("Link", card.joinUrl ? `<a href="${escapeAttribute(card.joinUrl)}" style="color:#0b57d0;">${escapeHtml(card.joinUrl)}</a>` : "Pendiente de provisión")}
        ${card.codigoReunion ? detailRow("Código Meet", escapeHtml(card.codigoReunion)) : ""}
        ${card.usuarioSala ? detailRow("Usuario sala", escapeHtml(card.usuarioSala)) : ""}
        ${card.passwordSala ? detailRow("Contraseña sala", escapeHtml(card.passwordSala)) : ""}
      </table>
      ${card.observaciones.length ? `<p style="margin:14px 0 0;color:#4b5563;font-size:13px;">${escapeHtml(card.observaciones.join("; "))}</p>` : ""}
    </section>
  `).join("");

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <main style="max-width:720px;margin:0 auto;padding:28px 18px;">
      <section style="background:#ffffff;border-radius:8px;padding:24px 24px 10px;border:1px solid #d8e0ea;">
        <p style="margin:0 0 14px;font-size:16px;">Hola ${escapeHtml(input.greetingName)},</p>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#374151;">${escapeHtml(input.intro)}</p>
        ${htmlCards}
        <p style="margin:22px 0 4px;font-size:15px;">Saludos,</p>
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1b365d;">${escapeHtml(footer)}</p>
      </section>
    </main>
  </body>
</html>`;

  return { text, html };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="width:150px;padding:7px 10px 7px 0;color:#4b5563;border-top:1px solid #edf1f5;">${escapeHtml(label)}</td>
    <td style="padding:7px 0;border-top:1px solid #edf1f5;color:#111827;">${value}</td>
  </tr>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
