import { normalizeCohostEmails } from "./cohosts.domain";
import { normalizeMeetLink } from "./meet-link.domain";
import type { DetalleCohostsVerificados } from "./conferencias.types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function canonicalMeetCode(code: string | null | undefined): string {
  if (!code || typeof code !== "string") {
    return "";
  }
  const normalized = normalizeMeetLink(code)?.code;
  if (normalized) {
    return normalized;
  }
  const alphanumeric = code.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (alphanumeric.length === 10) {
    return `${alphanumeric.slice(0, 3)}-${alphanumeric.slice(3, 7)}-${alphanumeric.slice(7, 10)}`;
  }
  return alphanumeric;
}

/** Only call after the adapter has read COHOST roles back from Google Meet. */
export function registrarVerificacionCohosts(
  payload: unknown,
  codigoReunion: string,
  organizer: string,
  emails: readonly string[],
  verifiedAt: string,
): Record<string, unknown> {
  const previous = record(payload);
  return {
    ...previous,
    salaVirtual: {
      ...record(previous["salaVirtual"]),
      cohostVerification: {
        codigoReunion: canonicalMeetCode(codigoReunion) || codigoReunion.trim().toLowerCase(),
        organizer: organizer.trim().toLowerCase(),
        emails: normalizeCohostEmails(emails).filter(
          (email) => email !== organizer.trim().toLowerCase(),
        ),
        verifiedAt,
      },
    },
  };
}

export function invalidarVerificacionCohosts(payload: unknown): Record<string, unknown> {
  const previous = record(payload);
  return {
    ...previous,
    salaVirtual: { ...record(previous["salaVirtual"]), cohostVerification: null },
  };
}

export function detalleCohostsVerificados(
  payload: unknown,
  codigoReunion: string | null | undefined,
  organizer: string | null | undefined,
  emails: readonly string[],
): DetalleCohostsVerificados {
  const desired = normalizeCohostEmails(emails).filter(
    (email) => email !== organizer?.trim().toLowerCase(),
  );
  if (desired.length === 0) {
    return { confirmados: true, emailsConfirmados: [], emailsPendientes: [] };
  }
  const verification = record(record(record(payload)["salaVirtual"])["cohostVerification"]);
  const codeCandidate = canonicalMeetCode(codigoReunion);
  const storedCode = canonicalMeetCode(
    typeof verification["codigoReunion"] === "string" ? verification["codigoReunion"] : "",
  );

  if (
    !codigoReunion ||
    !organizer ||
    !codeCandidate ||
    !storedCode ||
    codeCandidate !== storedCode ||
    verification["organizer"] !== organizer.trim().toLowerCase() ||
    typeof verification["verifiedAt"] !== "string" ||
    !Number.isFinite(Date.parse(verification["verifiedAt"])) ||
    !Array.isArray(verification["emails"])
  ) {
    return { confirmados: false, emailsConfirmados: [], emailsPendientes: desired };
  }
  const confirmed = new Set(verification["emails"]);
  const emailsConfirmados = desired.filter((email) => confirmed.has(email));
  const emailsPendientes = desired.filter((email) => !confirmed.has(email));
  return {
    confirmados: emailsPendientes.length === 0 && desired.length > 0,
    emailsConfirmados,
    emailsPendientes,
  };
}

export function cohostsConfirmados(
  payload: unknown,
  codigoReunion: string | null | undefined,
  organizer: string | null | undefined,
  emails: readonly string[],
): boolean {
  return detalleCohostsVerificados(payload, codigoReunion, organizer, emails).confirmados;
}
