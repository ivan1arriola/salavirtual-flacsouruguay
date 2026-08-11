import {
  cumpleSeparacionMinimaAsistencias,
  type PeriodoAsistencia
} from "./asistencia.domain";

export type AssignmentSuggestionInput = Readonly<{
  meetings: readonly Readonly<{
    covered: boolean;
    meeting: {
      id: string;
      inicioProgramadoAt: Date;
      finProgramadoAt: Date;
      timezone: string;
      postulaciones: readonly Readonly<{ asistenteTecnico: { id: string } }>[];
    };
  }>[];
  assistants: readonly Readonly<{
    id: string;
    name: string;
    disponibilidades?: readonly DisponibilidadInput[];
  }>[];
  assignments: readonly Readonly<{
    assistantId: string;
    meetingId: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
  }>[];
}>;

export type DisponibilidadInput = Readonly<{
  diaSemana: number | null;
  fecha: Date | null;
  horaDesde: string;
  horaHasta: string;
  timezone: string;
  tipo: "DISPONIBLE" | "NO_DISPONIBLE" | "PREFERENTE";
}>;

export type AssignmentSuggestion = Readonly<{
  id: string;
  name: string;
  reason: string;
}>;

export function buildAssignmentSuggestions(input: AssignmentSuggestionInput) {
  const assistantById = new Map(input.assistants.map((assistant) => [assistant.id, assistant]));
  const monthlyLoads = new Map<string, number>();
  const schedules = new Map<string, PeriodoAsistencia[]>();

  for (const assignment of input.assignments) {
    const minutes = minutesBetween(assignment.startsAt, assignment.endsAt);
    const loadKey = `${assignment.assistantId}:${monthKey(assignment.startsAt, assignment.timezone)}`;
    monthlyLoads.set(loadKey, (monthlyLoads.get(loadKey) ?? 0) + minutes);
    schedules.set(assignment.assistantId, [
      ...(schedules.get(assignment.assistantId) ?? []),
      { inicio: assignment.startsAt, fin: assignment.endsAt }
    ]);
  }

  const suggestions = new Map<string, AssignmentSuggestion>();
  const pendingMeetings = input.meetings
    .filter(({ covered }) => !covered)
    .map(({ meeting }) => meeting)
    .sort((left, right) => left.inicioProgramadoAt.getTime() - right.inicioProgramadoAt.getTime());

  for (const meeting of pendingMeetings) {
    const applicantIds = [
      ...new Set(
        meeting.postulaciones
          .map((interest) => interest.asistenteTecnico.id)
          .filter((assistantId) => assistantById.has(assistantId))
      )
    ];
    const applicantSet = new Set(applicantIds);
    const meetingPeriod = {
      inicio: meeting.inicioProgramadoAt,
      fin: meeting.finProgramadoAt
    };
    const keySuffix = monthKey(meeting.inicioProgramadoAt, meeting.timezone);
    const availability = new Map(input.assistants.map((assistant) => [
      assistant.id,
      evaluarDisponibilidad(
        meeting.inicioProgramadoAt,
        meeting.finProgramadoAt,
        assistant.disponibilidades ?? []
      )
    ]));
    const available = (candidateIds: readonly string[]) =>
      candidateIds
        .filter((assistantId) => availability.get(assistantId)?.tipo !== "NO_DISPONIBLE")
        .filter((assistantId) =>
          (schedules.get(assistantId) ?? []).every((scheduled) =>
            cumpleSeparacionMinimaAsistencias(scheduled, meetingPeriod)
          )
        )
        .sort((left, right) => {
          const leftScore = (availability.get(left)?.puntaje ?? 0) * 2 + Number(applicantSet.has(left));
          const rightScore = (availability.get(right)?.puntaje ?? 0) * 2 + Number(applicantSet.has(right));
          if (leftScore !== rightScore) return rightScore - leftScore;
          const leftLoad = monthlyLoads.get(`${left}:${keySuffix}`) ?? 0;
          const rightLoad = monthlyLoads.get(`${right}:${keySuffix}`) ?? 0;
          if (leftLoad !== rightLoad) return leftLoad - rightLoad;
          return (assistantById.get(left)?.name ?? left).localeCompare(
            assistantById.get(right)?.name ?? right,
            "es"
          );
        });

    const selectedId = available(input.assistants.map(({ id }) => id))[0];
    const selected = selectedId ? assistantById.get(selectedId) : null;
    if (!selected) continue;

    const loadBefore = monthlyLoads.get(`${selected.id}:${keySuffix}`) ?? 0;
    const reason = [
      availability.get(selected.id)?.etiqueta,
      applicantSet.has(selected.id)
        ? "Se postuló"
        : applicantIds.length > 0 ? "Sin postulantes disponibles" : null,
      `${formatLoad(loadBefore)} este mes`
    ].filter(Boolean).join(" · ");
    suggestions.set(meeting.id, { id: selected.id, name: selected.name, reason });
    monthlyLoads.set(
      `${selected.id}:${keySuffix}`,
      loadBefore + minutesBetween(meeting.inicioProgramadoAt, meeting.finProgramadoAt)
    );
    schedules.set(selected.id, [...(schedules.get(selected.id) ?? []), meetingPeriod]);
  }

  return suggestions;
}

export function evaluarDisponibilidad(
  startsAt: Date,
  endsAt: Date,
  records: readonly DisponibilidadInput[]
): Readonly<{
  tipo: "PREFERENTE" | "DISPONIBLE" | "SIN_DEFINIR" | "NO_DISPONIBLE";
  puntaje: number;
  etiqueta?: string;
}> {
  const exact = records.filter((record) =>
    record.fecha && record.fecha.toISOString().slice(0, 10) === dateKey(startsAt, record.timezone)
  );
  const relevant = exact.length > 0
    ? exact
    : records.filter((record) =>
        record.fecha === null && record.diaSemana === weekday(startsAt, record.timezone)
      );
  const overlapping = relevant.filter((record) => {
    const start = timeKey(startsAt, record.timezone);
    const end = timeKey(endsAt, record.timezone);
    return record.horaDesde < end && record.horaHasta > start;
  });
  if (overlapping.some(({ tipo }) => tipo === "NO_DISPONIBLE")) {
    return { tipo: "NO_DISPONIBLE", puntaje: -1, etiqueta: "No disponible" };
  }
  const covering = overlapping.filter((record) => {
    const start = timeKey(startsAt, record.timezone);
    const end = timeKey(endsAt, record.timezone);
    return record.horaDesde <= start && record.horaHasta >= end;
  });
  if (covering.some(({ tipo }) => tipo === "PREFERENTE")) {
    return { tipo: "PREFERENTE", puntaje: 2, etiqueta: "Disponibilidad preferente" };
  }
  if (covering.some(({ tipo }) => tipo === "DISPONIBLE")) {
    return { tipo: "DISPONIBLE", puntaje: 1, etiqueta: "Disponible en ese horario" };
  }
  return { tipo: "SIN_DEFINIR", puntaje: 0 };
}

function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function weekday(date: Date, timezone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/Montevideo",
    weekday: "short"
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function timeKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return `${parts.find(({ type }) => type === "hour")?.value ?? "00"}:${parts.find(({ type }) => type === "minute")?.value ?? "00"}`;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function monthKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Montevideo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value
    ?? String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatLoad(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
