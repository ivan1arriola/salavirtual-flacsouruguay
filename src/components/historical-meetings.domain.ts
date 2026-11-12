type SearchableHistoricalMeeting = Readonly<{
  title: string;
  program: string;
  account: string;
}>;

export function filterHistoricalMeetings<T extends SearchableHistoricalMeeting>(
  meetings: readonly T[],
  query: string
): T[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...meetings];
  }

  return meetings.filter((meeting) =>
    [meeting.title, meeting.program, meeting.account].some((value) =>
      normalize(value).includes(normalizedQuery)
    )
  );
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
