export function normalizeCohostEmails(emails: readonly string[]): readonly string[] {
  return [...new Set(emails.map((email) => email.toLowerCase()))];
}

export function cohostAccountGuidance(emails: readonly string[]): string {
  if (emails.length === 0) return "";
  const normalized = normalizeCohostEmails(emails);
  const allFlacso = normalized.every((email) => email.endsWith("@flacso.edu.uy"));
  return allFlacso ? "ingresar con cuenta FLACSO" : "ingresar con cuenta Google";
}
