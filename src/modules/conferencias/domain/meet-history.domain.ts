import { meetLinks, normalizeMeetLink } from "./meet-link.domain";

export const MEET_HISTORY_ACTIONS = [
  "ENLACE_MEET_REGISTRADO",
  "MEET_MIGRADO_A_ESPACIO_PREVIEW",
  "MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW",
  "ENLACE_MEET_ASIGNADO_A_SERIE",
  "ENLACE_MEET_UNIFICADO_EN_SERIE"
] as const;

export type MeetAudit = Readonly<{
  id: string;
  accion: string;
  entidadTipo: string;
  entidadId: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  createdAt: Date;
}>;

export type MeetChange = Readonly<{
  auditId: string;
  at: Date;
  before: readonly string[];
  after: readonly string[];
  origin: string;
  reason: string | null;
}>;

export type MeetEvidence = Readonly<{
  meetingIds: readonly string[];
  seriesId: string | null;
  change: MeetChange;
}>;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function codes(value: Record<string, unknown>): string[] {
  return [
    ...new Set([
      ...meetLinks(value.codigoReunion ?? value.codigoMeet, value.joinUrl ?? value.meetUrl).map(
        (x) => x.code
      ),
      ...strings(value.codigosMeet).flatMap((x) => {
        const link = normalizeMeetLink(x);
        return link ? [link.code] : [];
      })
    ])
  ];
}

export function readMeetEvidence(audit: MeetAudit): MeetEvidence | null {
  if (!(MEET_HISTORY_ACTIONS as readonly string[]).includes(audit.accion)) {
    return null;
  }
  const before = record(audit.valorAnterior);
  const after = record(audit.valorNuevo);
  const target = evidenceTarget(audit, before, after);
  if (!target) {
    return null;
  }
  const change: MeetChange = {
    auditId: audit.id,
    at: audit.createdAt,
    before: codes(before),
    after: codes(after),
    origin: typeof after.origen === "string" ? after.origen : audit.accion,
    reason:
      typeof after.motivo === "string"
        ? after.motivo
        : audit.accion.includes("MIGRADO")
          ? "Migración a un espacio Meet Preview"
          : audit.accion === "ENLACE_MEET_ASIGNADO_A_SERIE"
            ? "Asignación de enlace a la serie"
            : audit.accion === "ENLACE_MEET_UNIFICADO_EN_SERIE"
              ? "Unificación de enlaces de la serie"
              : null
  };
  if (!change.before.length && !change.after.length) {
    return null;
  }
  return {
    meetingIds: [...new Set(target.meetingIds)],
    seriesId: target.seriesId,
    change
  };
}

export function evidenceMatches(change: MeetChange, code: string): boolean {
  return change.before.includes(code) || change.after.includes(code);
}

function evidenceTarget(
  audit: MeetAudit,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Readonly<{ meetingIds: readonly string[]; seriesId: string | null }> | null {
  switch (audit.accion) {
    case "ENLACE_MEET_REGISTRADO":
      return audit.entidadTipo === "EventoProveedor"
        ? {
            meetingIds: typeof after.instanciaSalaId === "string" ? [after.instanciaSalaId] : [],
            seriesId: null
          }
        : null;
    case "MEET_MIGRADO_A_ESPACIO_PREVIEW":
      return audit.entidadTipo === "InstanciaSala" ? { meetingIds: [audit.entidadId], seriesId: null } : null;
    case "MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW":
      return audit.entidadTipo === "InstanciaSala"
        ? {
            meetingIds: strings(before.encuentros).filter((id) => strings(after.encuentros).includes(id)),
            seriesId: null
          }
        : null;
    default:
      return audit.entidadTipo === "SolicitudSala" ? { meetingIds: [], seriesId: audit.entidadId } : null;
  }
}
