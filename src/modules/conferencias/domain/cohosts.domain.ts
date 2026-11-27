export function normalizeCohostEmails(emails: readonly string[]): readonly string[] {
  return [...new Set(emails.map((email) => email.toLowerCase().trim()).filter(Boolean))];
}

export function cohostAccountGuidance(emails: readonly string[]): string {
  if (emails.length === 0) {
    return "";
  }
  const normalized = normalizeCohostEmails(emails);
  const allFlacso = normalized.every((email) => email.endsWith("@flacso.edu.uy"));
  return allFlacso ? "ingresar con cuenta FLACSO" : "ingresar con cuenta Google";
}

export type CohostUnificado = Readonly<{
  email: string;
  name?: string | null;
  cuentaGoogleId?: string | null;
}>;

export type CohostContainer = Readonly<{
  cohosts?:
    | readonly {
        cuentaGoogleId?: string | null;
        cuentaGoogle?: {
          id?: string | null;
          email?: string | null;
          user?: { nombres?: string | null; apellidos?: string | null } | null;
        } | null;
      }[]
    | null;
  cohostEmails?:
    | readonly {
        email?: string | null;
      }[]
    | null;
}>;

export function extraerCohostsUnificadosDeInstancia(
  meeting?: CohostContainer | null
): readonly CohostUnificado[] {
  if (!meeting) {
    return [];
  }

  const fromCohosts: readonly CohostUnificado[] = (meeting.cohosts ?? []).flatMap((c) => {
    const rawEmail = c.cuentaGoogle?.email;
    if (!rawEmail) {
      return [];
    }
    const email = rawEmail.trim().toLowerCase();
    if (!email) {
      return [];
    }
    const name =
      [c.cuentaGoogle?.user?.nombres, c.cuentaGoogle?.user?.apellidos].filter(Boolean).join(" ").trim() ||
      undefined;
    const cuentaGoogleId = c.cuentaGoogleId ?? c.cuentaGoogle?.id ?? undefined;
    return [{ email, ...(name === undefined ? {} : { name }), ...(cuentaGoogleId === undefined ? {} : { cuentaGoogleId }) }];
  });

  const fromEmails: readonly CohostUnificado[] = (meeting.cohostEmails ?? []).flatMap((ce) => {
    const rawEmail = ce.email;
    if (!rawEmail) {
      return [];
    }
    const email = rawEmail.trim().toLowerCase();
    if (!email) {
      return [];
    }
    return [{ email, cuentaGoogleId: null }];
  });

  const all = [...fromCohosts, ...fromEmails];
  return all.filter(
    (entry, index) => all.findIndex((candidate) => candidate.email === entry.email) === index
  );
}

export function extraerCohostEmailsDeInstancia(meeting?: CohostContainer | null): readonly string[] {
  return extraerCohostsUnificadosDeInstancia(meeting).map((c) => c.email);
}
