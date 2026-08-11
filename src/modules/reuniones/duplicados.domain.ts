export type CandidataReunionDuplicada = Readonly<{
  id: string;
  solicitudId: string;
  titulo: string;
  programaId: string;
  programaNombre: string;
  docenteId: string;
  docenteNombre: string;
  inicio: Date;
  fin: Date;
}>;

export type PosibleReunionDuplicada = Readonly<{
  izquierda: CandidataReunionDuplicada;
  derecha: CandidataReunionDuplicada;
  motivo: "COINCIDENCIA_EXACTA" | "HORARIO_SUPERPUESTO";
}>;

export const DECISIONES_REVISION_DUPLICADO = [
  "REQUIERE_ACTUALIZACION",
  "FALSO_POSITIVO"
] as const;

export type DecisionRevisionDuplicado = (typeof DECISIONES_REVISION_DUPLICADO)[number];

export function claveRevisionDuplicado(izquierdaId: string, derechaId: string): string {
  return [izquierdaId, derechaId].sort((left, right) => left.localeCompare(right)).join(":");
}

export function esDecisionRevisionDuplicado(value: unknown): value is DecisionRevisionDuplicado {
  return typeof value === "string" && DECISIONES_REVISION_DUPLICADO.some((decision) => decision === value);
}

export function detectarPosiblesReunionesDuplicadas(
  meetings: readonly CandidataReunionDuplicada[]
): readonly PosibleReunionDuplicada[] {
  const ordered = meetings.reduce<readonly CandidataReunionDuplicada[]>((result, meeting) => {
    const position = result.findIndex((current) =>
      meeting.inicio.getTime() < current.inicio.getTime() ||
      (meeting.inicio.getTime() === current.inicio.getTime() && meeting.id.localeCompare(current.id) < 0)
    );
    return position < 0
      ? [...result, meeting]
      : [...result.slice(0, position), meeting, ...result.slice(position)];
  }, []);
  return ordered.flatMap((left, leftIndex) =>
    ordered
      .slice(leftIndex + 1)
      .filter((right) =>
        right.inicio < left.fin &&
        left.docenteId === right.docenteId &&
        right.fin > left.inicio
      )
      .map((right): PosibleReunionDuplicada => {
        const exact = left.inicio.getTime() === right.inicio.getTime() &&
          left.fin.getTime() === right.fin.getTime() &&
          left.programaId === right.programaId &&
          normalizarTitulo(left.titulo) === normalizarTitulo(right.titulo);
        return {
          izquierda: left,
          derecha: right,
          motivo: exact ? "COINCIDENCIA_EXACTA" : "HORARIO_SUPERPUESTO"
        };
      })
  );
}

function normalizarTitulo(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
