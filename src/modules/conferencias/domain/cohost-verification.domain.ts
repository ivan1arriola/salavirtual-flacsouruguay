import { normalizeCohostEmails } from "./cohosts.domain";
import type { DetalleCohostsVerificados } from "./conferencias.types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Only call after the adapter has read COHOST roles back from Google Meet. */
export function registrarVerificacionCohosts(
  payload: unknown,
  codigoReunion: string,
  organizer: string,
  emails: readonly string[],
  verifiedAt: string
): Record<string, unknown> {
  const previous = record(payload);
  return {
    ...previous,
    salaVirtual: {
      ...record(previous.salaVirtual),
      cohostVerification: {
        codigoReunion,
        organizer: organizer.trim().toLowerCase(),
        emails: normalizeCohostEmails(emails).filter(
          (email) => email !== organizer.trim().toLowerCase()
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
    salaVirtual: { ...record(previous.salaVirtual), cohostVerification: null },
  };
}

export function detalleCohostsVerificados(
  payload: unknown,
  codigoReunion: string | null | undefined,
  organizer: string | null | undefined,
  emails: readonly string[]
): DetalleCohostsVerificados {
  const desired = normalizeCohostEmails(emails).filter(
    (email) => email !== organizer?.trim().toLowerCase()
  );
  if (desired.length === 0) {
    return { confirmados: true, emailsConfirmados: [], emailsPendientes: [] };
  }
  const verification = record(record(record(payload).salaVirtual).cohostVerification);
  if (
    !codigoReunion ||
    !organizer ||
    verification.codigoReunion !== codigoReunion ||
    verification.organizer !== organizer.trim().toLowerCase() ||
    typeof verification.verifiedAt !== "string" ||
    !Number.isFinite(Date.parse(verification.verifiedAt)) ||
    !Array.isArray(verification.emails)
  ) {
    return { confirmados: false, emailsConfirmados: [], emailsPendientes: desired };
  }
  const confirmed = new Set(verification.emails);
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
  emails: readonly string[]
): boolean {
  const desired = normalizeCohostEmails(emails).filter(
    (email) => email !== organizer?.trim().toLowerCase()
  );
  if (desired.length === 0) return false;
  return detalleCohostsVerificados(payload, codigoReunion, organizer, emails).confirmados;
}

