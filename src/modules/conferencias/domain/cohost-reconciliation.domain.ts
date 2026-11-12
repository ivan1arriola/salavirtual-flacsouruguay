import { normalizeCohostEmails } from "./cohosts.domain";

export function cohostMemberNamesToRemove(
  previousEmails: readonly string[],
  desiredEmails: readonly string[],
  members: readonly Readonly<{ name?: string; email?: string | null; role?: string }>[]
): string[] {
  const previous = new Set(normalizeCohostEmails(previousEmails));
  const desired = new Set(normalizeCohostEmails(desiredEmails));

  return members.flatMap((member) => {
    const email = member.email?.trim().toLowerCase();
    return member.role === "COHOST" && member.name && email && previous.has(email) && !desired.has(email)
      ? [member.name]
      : [];
  });
}
