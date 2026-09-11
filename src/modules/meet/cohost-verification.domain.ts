import { normalizeCohostEmails } from "./cohosts.domain";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Only call after the adapter has read COHOST roles back from Google Meet. */
export function registrarVerificacionCohosts(
  payload: unknown, codigoReunion: string, organizer: string, emails: readonly string[],
) {
  const previous = record(payload);
  return {
    ...previous,
    salaVirtual: {
      ...record(previous.salaVirtual),
      cohostVerification: {
        codigoReunion,
        organizer: organizer.trim().toLowerCase(),
        emails: normalizeCohostEmails(emails).filter((email) => email !== organizer.trim().toLowerCase()),
        verifiedAt: new Date().toISOString(),
      },
    },
  };
}

export function invalidarVerificacionCohosts(payload: unknown) {
  const previous = record(payload);
  return { ...previous, salaVirtual: { ...record(previous.salaVirtual), cohostVerification: null } };
}

export function cohostsConfirmados(
  payload: unknown, codigoReunion: string | null | undefined,
  organizer: string | null | undefined, emails: readonly string[],
): boolean {
  const verification = record(record(record(payload).salaVirtual).cohostVerification);
  if (!codigoReunion || !organizer || verification.codigoReunion !== codigoReunion ||
      verification.organizer !== organizer.trim().toLowerCase() ||
      typeof verification.verifiedAt !== "string" || !Number.isFinite(Date.parse(verification.verifiedAt)) ||
      !Array.isArray(verification.emails)) return false;
  const confirmed = new Set(verification.emails);
  const desired = normalizeCohostEmails(emails).filter((email) => email !== organizer.trim().toLowerCase());
  return desired.length > 0 && desired.every((email) => confirmed.has(email));
}
