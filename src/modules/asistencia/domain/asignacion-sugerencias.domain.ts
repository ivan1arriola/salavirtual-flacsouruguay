import { cumpleSeparacionMinimaAsistencias } from "./asistencia.domain";
import type {
  AssignmentSuggestion,
  AssignmentSuggestionInput,
  DisponibilidadInput,
  PeriodoAsistencia
} from "./asistencia.types";

export function buildAssignmentSuggestions(
  input: AssignmentSuggestionInput
): Map<string, AssignmentSuggestion> {
  const eligibleAssistants = input.assistants.filter(
    (assistant) => !assistant.cesadoHastaProximoInicioSesion
  );
  const assistantById = new Map(eligibleAssistants.map((assistant) => [assistant.id, assistant] as const));

  const initialLoads: Readonly<Record<string, number>> = input.assignments.reduce<Record<string, number>>(
    (acc, assignment) => {
      const minutes = minutesBetween(assignment.startsAt, assignment.endsAt);
      const loadKey = `${assignment.assistantId}:${monthKey(assignment.startsAt, assignment.timezone)}`;
      return {
        ...acc,
        [loadKey]: (acc[loadKey] ?? 0) + minutes
      };
    },
    {}
  );

  const initialSchedules: Readonly<Record<string, readonly PeriodoAsistencia[]>> = input.assignments.reduce<
    Record<string, readonly PeriodoAsistencia[]>
  >((acc, assignment) => {
    const existing = acc[assignment.assistantId] ?? [];
    return {
      ...acc,
      [assignment.assistantId]: [...existing, { inicio: assignment.startsAt, fin: assignment.endsAt }]
    };
  }, {});

  const pendingMeetings = ordenarArray(
    input.meetings.filter(({ covered }) => !covered).map(({ meeting }) => meeting),
    (left, right) => left.inicioProgramadoAt.getTime() - right.inicioProgramadoAt.getTime()
  );

  type StepState = Readonly<{
    suggestions: readonly (readonly [string, AssignmentSuggestion])[];
    loads: Readonly<Record<string, number>>;
    schedules: Readonly<Record<string, readonly PeriodoAsistencia[]>>;
  }>;

  const finalState = pendingMeetings.reduce<StepState>(
    (state, meeting) => {
      const applicantIds = [
        ...new Set(
          meeting.postulaciones
            .map((interest) => interest.asistenteTecnico.id)
            .filter((assistantId) => assistantById.has(assistantId))
        )
      ];
      const applicantSet = new Set(applicantIds);
      const coverageStart = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
      const coverageEnd = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
      const meetingPeriod = {
        inicio: coverageStart,
        fin: coverageEnd
      };
      const keySuffix = monthKey(coverageStart, meeting.timezone);

      const availabilityById: Readonly<Record<string, ReturnType<typeof evaluarDisponibilidad>>> =
        eligibleAssistants.reduce(
          (acc, assistant) => ({
            ...acc,
            [assistant.id]: evaluarDisponibilidad(
              coverageStart,
              coverageEnd,
              assistant.disponibilidades ?? []
            )
          }),
          {}
        );

      const candidateIds = eligibleAssistants.map(({ id }) => id);
      const availableCandidates = ordenarArray(
        candidateIds
          .filter((assistantId) => availabilityById[assistantId]?.tipo !== "NO_DISPONIBLE")
          .filter((assistantId) =>
            (state.schedules[assistantId] ?? []).every((scheduled) =>
              cumpleSeparacionMinimaAsistencias(scheduled, meetingPeriod)
            )
          ),
        (left, right) => {
          const leftScore = (availabilityById[left]?.puntaje ?? 0) * 2 + Number(applicantSet.has(left));
          const rightScore = (availabilityById[right]?.puntaje ?? 0) * 2 + Number(applicantSet.has(right));
          if (leftScore !== rightScore) {
            return rightScore - leftScore;
          }
          const leftLoad = state.loads[`${left}:${keySuffix}`] ?? 0;
          const rightLoad = state.loads[`${right}:${keySuffix}`] ?? 0;
          if (leftLoad !== rightLoad) {
            return leftLoad - rightLoad;
          }
          return (assistantById.get(left)?.name ?? left).localeCompare(
            assistantById.get(right)?.name ?? right,
            "es"
          );
        }
      );

      const selectedId = availableCandidates[0];
      const selected = selectedId ? assistantById.get(selectedId) : null;
      if (!selected) {
        return state;
      }

      const loadBefore = state.loads[`${selected.id}:${keySuffix}`] ?? 0;
      const reason = [
        availabilityById[selected.id]?.etiqueta,
        applicantSet.has(selected.id)
          ? "Se postuló"
          : applicantIds.length > 0
            ? "Sin postulantes disponibles"
            : null,
        `${formatLoad(loadBefore)} este mes`
      ]
        .filter(Boolean)
        .join(" · ");

      const duration = minutesBetween(coverageStart, coverageEnd);

      return {
        suggestions: [
          ...state.suggestions,
          [meeting.id, { id: selected.id, name: selected.name, reason }] as const
        ],
        loads: {
          ...state.loads,
          [`${selected.id}:${keySuffix}`]: loadBefore + duration
        },
        schedules: {
          ...state.schedules,
          [selected.id]: [...(state.schedules[selected.id] ?? []), meetingPeriod]
        }
      };
    },
    { suggestions: [], loads: initialLoads, schedules: initialSchedules }
  );

  return new Map(finalState.suggestions);
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
  const exact = records.filter(
    (record) => record.fecha && record.fecha.toISOString().slice(0, 10) === dateKey(startsAt, record.timezone)
  );
  const relevant =
    exact.length > 0
      ? exact
      : records.filter(
          (record) => record.fecha === null && record.diaSemana === weekday(startsAt, record.timezone)
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

function ordenarArray<T>(items: readonly T[], compare: (a: T, b: T) => number): readonly T[] {
  return items.toSorted(compare);
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

function monthKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Montevideo",
    year: "numeric",
    month: "2-digit"
  }).format(date);
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function formatLoad(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours === 0) {
    return `${remMinutes} min`;
  }
  if (remMinutes === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${remMinutes} min`;
}
