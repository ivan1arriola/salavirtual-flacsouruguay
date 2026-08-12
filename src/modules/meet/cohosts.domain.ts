export function normalizeCohostEmails(emails: readonly string[]): readonly string[] {
  return [...new Set(emails.map((email) => email.toLowerCase()))];
}
