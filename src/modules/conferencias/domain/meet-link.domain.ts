export type MeetLink = Readonly<{ code: string; url: string }>;

/** One parser for user input and persisted provider values. No substring matches. */
export function normalizeMeetLink(input: unknown): MeetLink | null {
  if (typeof input !== "string" || input.length > 2048) {
    return null;
  }
  const value = input.replace(/\s/g, "").toLowerCase();
  const match = value.match(
    /^(?:(?:https?:\/\/)?meet\.google\.com\/(?:lookup\/)?)?([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\/?(?:[?#][^\s]*)?)?$/
  );
  if (!match) {
    return null;
  }
  // Parameters are meaningful only on URLs, never on bare codes.
  if (!value.includes("meet.google.com/") && value !== match[1]) {
    return null;
  }
  return { code: match[1], url: `https://meet.google.com/${match[1]}` };
}

export function meetLinks(code: unknown, url: unknown): readonly MeetLink[] {
  const links = [normalizeMeetLink(code), normalizeMeetLink(url)].filter((x): x is MeetLink => x !== null);
  return [...new Map(links.map((link) => [link.code, link])).values()];
}
