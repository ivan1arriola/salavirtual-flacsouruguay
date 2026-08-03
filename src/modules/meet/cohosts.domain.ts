export const REQUIRED_COHOST_EMAILS = Object.freeze(["web@flacso.edu.uy"] as const);

export function withRequiredCohostEmails(emails: readonly string[]): readonly string[] {
  return [...new Set([...emails, ...REQUIRED_COHOST_EMAILS].map((email) => email.toLowerCase()))];
}
