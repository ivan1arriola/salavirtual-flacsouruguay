export type AssignmentSuggestionInput = Readonly<{
  meetings: readonly Readonly<{
    covered: boolean;
    meeting: {
      id: string;
      inicioProgramadoAt: Date;
      finProgramadoAt: Date;
      timezone: string;
      intereses: readonly Readonly<{ asistente: { id: string } }>[];
    };
  }>[];
  assistants: readonly Readonly<{ id: string; name: string }>[];
  assignments: readonly Readonly<{
    assistantId: string;
    meetingId: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
  }>[];
}>;

export type AssignmentSuggestion = Readonly<{
  id: string;
  name: string;
  reason: string;
}>;

export function buildAssignmentSuggestions(input: AssignmentSuggestionInput) {
  const assistantById = new Map(input.assistants.map((assistant) => [assistant.id, assistant]));
  const monthlyLoads = new Map<string, number>();
  const schedules = new Map<string, Array<readonly [number, number]>>();

  for (const assignment of input.assignments) {
    const minutes = minutesBetween(assignment.startsAt, assignment.endsAt);
    const loadKey = `${assignment.assistantId}:${monthKey(assignment.startsAt, assignment.timezone)}`;
    monthlyLoads.set(loadKey, (monthlyLoads.get(loadKey) ?? 0) + minutes);
    schedules.set(assignment.assistantId, [
      ...(schedules.get(assignment.assistantId) ?? []),
      [assignment.startsAt.getTime(), assignment.endsAt.getTime()]
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
        meeting.intereses
          .map((interest) => interest.asistente.id)
          .filter((assistantId) => assistantById.has(assistantId))
      )
    ];
    const applicantSet = new Set(applicantIds);
    const startsAtMs = meeting.inicioProgramadoAt.getTime();
    const endsAtMs = meeting.finProgramadoAt.getTime();
    const keySuffix = monthKey(meeting.inicioProgramadoAt, meeting.timezone);
    const available = (candidateIds: readonly string[]) =>
      candidateIds
        .filter((assistantId) =>
          !hasScheduleConflict(schedules.get(assistantId) ?? [], startsAtMs, endsAtMs)
        )
        .sort((left, right) => {
          const leftLoad = monthlyLoads.get(`${left}:${keySuffix}`) ?? 0;
          const rightLoad = monthlyLoads.get(`${right}:${keySuffix}`) ?? 0;
          if (leftLoad !== rightLoad) return leftLoad - rightLoad;
          return (assistantById.get(left)?.name ?? left).localeCompare(
            assistantById.get(right)?.name ?? right,
            "es"
          );
        });

    const selectedId = available(applicantIds)[0]
      ?? available(input.assistants.map(({ id }) => id).filter((id) => !applicantSet.has(id)))[0];
    const selected = selectedId ? assistantById.get(selectedId) : null;
    if (!selected) continue;

    const loadBefore = monthlyLoads.get(`${selected.id}:${keySuffix}`) ?? 0;
    const reason = applicantSet.has(selected.id)
      ? `Postulante con menor carga mensual (${formatLoad(loadBefore)})`
      : applicantIds.length > 0
        ? `Sin postulantes disponibles; menor carga mensual (${formatLoad(loadBefore)})`
        : `Menor carga mensual disponible (${formatLoad(loadBefore)})`;
    suggestions.set(meeting.id, { id: selected.id, name: selected.name, reason });
    monthlyLoads.set(
      `${selected.id}:${keySuffix}`,
      loadBefore + minutesBetween(meeting.inicioProgramadoAt, meeting.finProgramadoAt)
    );
    schedules.set(selected.id, [...(schedules.get(selected.id) ?? []), [startsAtMs, endsAtMs]]);
  }

  return suggestions;
}

function hasScheduleConflict(
  schedule: readonly (readonly [number, number])[],
  startsAtMs: number,
  endsAtMs: number
) {
  return schedule.some(
    ([scheduledStart, scheduledEnd]) => startsAtMs < scheduledEnd && endsAtMs > scheduledStart
  );
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
