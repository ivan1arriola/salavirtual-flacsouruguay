import { envolverCorreo, panelCorreo } from "../src/lib/email/email-design-system";

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

export type CuentaSala =
  | Readonly<{
      nombre: string;
      emailOrganizador: string | null;
      secretRef: string | null;
    }>
  | null
  | undefined;

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

export function fullName(persona: Readonly<{ nombres: string; apellidos?: string | null }>): string {
  return [persona.nombres, persona.apellidos].filter(Boolean).join(" ");
}

export function firstName(persona: Readonly<{ nombres: string }>): string {
  let end = persona.nombres.length;
  while (end > 0 && persona.nombres[end - 1] === ",") {
    end--;
  }
  return persona.nombres.slice(0, end);
}

export function passwordSala(cuenta: CuentaSala, descifrar: (value: string) => string): string | null {
  if (!cuenta?.secretRef) {
    return null;
  }
  try {
    return descifrar(cuenta.secretRef);
  } catch {
    return null;
  }
}

export function buildMeetingDigestEmail(
  input: Readonly<{
    greetingName: string;
    intro: string;
    cards: readonly MeetingEmailCard[];
    footer?: string;
  }>
): EmailMessage {
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

  const htmlCards = input.cards
    .map((card, index) =>
      panelCorreo(
        '<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#22618e;letter-spacing:.04em">REUNIÓN ' +
          (index + 1) +
          "</p>" +
          '<h2 style="margin:0 0 8px;font-size:18px;line-height:25px;color:#192b44">' +
          escapeHtml(card.titulo) +
          "</h2>" +
          '<p style="margin:0 0 12px;color:#526277;font-size:13px;line-height:20px">' +
          escapeHtml(card.programa) +
          " · " +
          escapeHtml(card.modalidad) +
          "</p>" +
          (card.docente
            ? '<p style="margin:0 0 7px;color:#33465c;font-size:13px;line-height:20px"><strong>Docente:</strong> ' +
              escapeHtml(card.docente) +
              "</p>"
            : "") +
          (card.estadoAsignacion
            ? '<p style="margin:0 0 7px;color:#33465c;font-size:13px;line-height:20px"><strong>Estado:</strong> ' +
              escapeHtml(card.estadoAsignacion) +
              "</p>"
            : "") +
          '<p style="margin:12px 0 5px;color:#183b70;font-weight:700;font-size:12px">' +
          (card.fechas.length === 1 ? "Fecha y horario" : "Fechas y horarios") +
          "</p>" +
          card.fechas
            .map(
              (fecha) =>
                '<p style="margin:0 0 5px;color:#33465c;font-size:13px;line-height:20px">' +
                escapeHtml(fecha) +
                "</p>"
            )
            .join("") +
          '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;margin-top:12px;font-size:13px">' +
          detailRow(
            "Acceso",
            card.joinUrl
              ? '<a href="' +
                  escapeAttribute(card.joinUrl) +
                  '" style="color:#087f9e;text-decoration:underline">Abrir Google Meet</a>'
              : "Pendiente de provisión"
          ) +
          (card.codigoReunion ? detailRow("Código Meet", escapeHtml(card.codigoReunion)) : "") +
          (card.usuarioSala ? detailRow("Usuario sala", escapeHtml(card.usuarioSala)) : "") +
          (card.passwordSala ? detailRow("Contraseña sala", escapeHtml(card.passwordSala)) : "") +
          "</table>" +
          (card.observaciones.length
            ? '<p style="margin:12px 0 0;color:#526277;font-size:12px;line-height:19px">' +
              escapeHtml(card.observaciones.join("; ")) +
              "</p>"
            : "")
      )
    )
    .join("");

  const html = envolverCorreo({
    categoria: "Cronograma de reuniones",
    titulo: "Información de tus próximas reuniones",
    resumen: input.intro,
    variante: "informativo",
    contenidoHtml:
      '<p style="margin:0 0 16px;color:#33465c;font-size:14px;line-height:22px">Hola, ' +
      escapeHtml(input.greetingName) +
      ".</p>" +
      htmlCards +
      '<p style="margin:16px 0 0;font-size:13px;color:#526277;line-height:20px">' +
      escapeHtml(footer) +
      "</p>"
  });

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
