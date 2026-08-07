export function assistantSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asistente";
}

export function assistantPathSegment(
  name: string,
  userId: string,
  needsDisambiguation = false
): string {
  const slug = assistantSlug(name);
  return needsDisambiguation ? `${slug}--${userId}` : slug;
}

export function userIdFromAssistantPath(segment: string): string {
  const separator = segment.lastIndexOf("--");
  return separator === -1 ? segment : segment.slice(separator + 2);
}
