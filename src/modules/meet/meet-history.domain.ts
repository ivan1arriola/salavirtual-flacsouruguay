import { meetLinks, normalizeMeetLink } from "./meet-link.domain";

export const MEET_HISTORY_ACTIONS = [
  "ENLACE_MEET_REGISTRADO",
  "MEET_MIGRADO_A_ESPACIO_PREVIEW",
  "MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW",
  "ENLACE_MEET_ASIGNADO_A_SERIE",
  "ENLACE_MEET_UNIFICADO_EN_SERIE",
] as const;

export type MeetAudit = Readonly<{
  id: string; accion: string; entidadTipo: string; entidadId: string;
  valorAnterior: unknown; valorNuevo: unknown; createdAt: Date;
}>;
export type MeetChange = Readonly<{
  auditId: string; at: Date; before: readonly string[]; after: readonly string[];
  origin: string; reason: string | null;
}>;
export type MeetEvidence = Readonly<{
  meetingIds: readonly string[]; seriesId: string | null; change: MeetChange;
}>;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}
function codes(value: Record<string, unknown>): string[] {
  return [...new Set([
    ...meetLinks(value.codigoReunion ?? value.codigoMeet, value.joinUrl ?? value.meetUrl).map((x) => x.code),
    ...strings(value.codigosMeet).flatMap((x) => {
      const link = normalizeMeetLink(x);
      return link ? [link.code] : [];
    }),
  ])];
}

/** Interpret only documented audit formats; never assign aggregate series codes to an instance. */
export function readMeetEvidence(audit: MeetAudit): MeetEvidence | null {
  if (!(MEET_HISTORY_ACTIONS as readonly string[]).includes(audit.accion)) return null;
  const before = record(audit.valorAnterior);
  const after = record(audit.valorNuevo);
  let meetingIds: readonly string[] = [];
  let seriesId: string | null = null;
  switch (audit.accion) {
    case "ENLACE_MEET_REGISTRADO":
      if (audit.entidadTipo !== "EventoProveedor") return null;
      meetingIds = typeof after.instanciaSalaId === "string" ? [after.instanciaSalaId] : [];
      break;
    case "MEET_MIGRADO_A_ESPACIO_PREVIEW":
      if (audit.entidadTipo !== "InstanciaSala") return null;
      meetingIds = [audit.entidadId];
      break;
    case "MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW":
      if (audit.entidadTipo !== "InstanciaSala") return null;
      // This migration records exactly which instances were migrated together.
      meetingIds = strings(before.encuentros).filter((id) => strings(after.encuentros).includes(id));
      break;
    default:
      if (audit.entidadTipo !== "SolicitudSala") return null;
      seriesId = audit.entidadId;
  }
  const change: MeetChange = {
    auditId: audit.id, at: audit.createdAt, before: codes(before), after: codes(after),
    origin: typeof after.origen === "string" ? after.origen : audit.accion,
    reason: typeof after.motivo === "string" ? after.motivo : (
      audit.accion.includes("MIGRADO") ? "Migración a un espacio Meet Preview" :
      audit.accion === "ENLACE_MEET_ASIGNADO_A_SERIE" ? "Asignación de enlace a la serie" :
      audit.accion === "ENLACE_MEET_UNIFICADO_EN_SERIE" ? "Unificación de enlaces de la serie" : null
    ),
  };
  if (!change.before.length && !change.after.length) return null;
  return { meetingIds: [...new Set(meetingIds)], seriesId, change };
}

export function evidenceMatches(change: MeetChange, code: string): boolean {
  return change.before.includes(code) || change.after.includes(code);
}
