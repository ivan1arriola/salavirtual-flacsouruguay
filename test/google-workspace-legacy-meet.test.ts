import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  jwtInstances: [] as Array<{ email: string; subject: string }>,
  failOnPrincipalEmail: null as string | null,
  failOnLegacyEmail: null as string | null,
  failOnlyOnMembers: false,
  failWithCode: 403,
  failWithMessage: "403: Permission denied on resource Member",
  legacyRows: [
    {
      id: "legacy:vieja",
      serviceAccountEmail: "vieja@flacso-zoom-app.iam.gserviceaccount.com",
      privateKeyCifrada: "cifrada",
      serviceAccountSubject: "web@flacso.edu.uy",
      activa: true,
    },
  ],
}));

vi.mock("@/src/lib/db", () => ({
  db: {
    configuracionGoogleWorkspace: {
      findMany: vi.fn(async () => state.legacyRows),
    },
  },
}));

vi.mock("@/src/lib/config/encryption", () => ({
  descifrarConfiguracion: (val: string) => `descifrada:${val}`,
}));

vi.mock("google-auth-library", () => ({
  JWT: class {
    email: string;
    subject: string;
    constructor(options: { email: string; subject: string }) {
      this.email = options.email;
      this.subject = options.subject;
      state.jwtInstances.push({ email: options.email, subject: options.subject });
    }
    async request(options: Record<string, any>) {
      const shouldFailEmail =
        (state.failOnPrincipalEmail && this.email === state.failOnPrincipalEmail) ||
        (state.failOnLegacyEmail && this.email === state.failOnLegacyEmail);
      const isMembersCall = typeof options.url === "string" && options.url.includes("/members");
      if (shouldFailEmail && (!state.failOnlyOnMembers || isMembersCall)) {
        const error = new Error(state.failWithMessage);
        (error as any).code = state.failWithCode;
        (error as any).response = { status: state.failWithCode, data: { error: state.failWithMessage } };
        throw error;
      }
      const url = new URL(options.url);
      if (url.hostname === "www.googleapis.com") {
        return {
          data: {
            id: "event",
            attendees: [],
            hangoutLink: "https://meet.google.com/abc-defg-hij",
            conferenceData: { conferenceId: "abc-defg-hij" },
          },
        };
      }
      if (url.pathname.includes("/members") && options.method === "POST") {
        return { data: { name: "spaces/space/members/1", email: options.data.email, role: "COHOST" } };
      }
      if (url.pathname.includes("/members") && options.method === "GET") {
        return {
          data: {
            members: [
              { name: "spaces/space/members/1", email: "docente@flacso.edu.uy", role: "COHOST" },
            ],
          },
        };
      }
      return { data: { name: "spaces/space", config: { moderation: "ON" } } };
    }
  },
}));

import {
  configurarGoogleMeetExistente,
  crearGoogleCalendarProvider,
  sincronizarCohostsGoogleExistente,
} from "../src/modules/meet/google-calendar.adapter";
import { cargarCredencialesLegacyGoogleWorkspace } from "../src/modules/configuracion/google-workspace.service";

describe("Fallback de credenciales Legacy para Google Meet", () => {
  const principalCreds = {
    serviceAccountEmail: "nueva@flacso-uruguay.iam.gserviceaccount.com",
    privateKey: "private-key-nueva",
    subject: "sala02@flacso.edu.uy",
  };

  beforeEach(() => {
    state.jwtInstances = [];
    state.failOnPrincipalEmail = null;
    state.failOnLegacyEmail = null;
    state.failOnlyOnMembers = false;
    state.failWithCode = 403;
    state.failWithMessage = "403: Permission denied on resource Member";
  });

  it("usa Principal (nueva) con subject del host, y en fallback usa Legacy (vieja) con el MISMO host (sala02), ignorando web@flacso.edu.uy", async () => {
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;

    await configurarGoogleMeetExistente(principalCreds, "abc-defg-hij", {
      cohostEmails: ["docente@flacso.edu.uy"],
    });

    // Verificamos que se intentó primero Principal con sala02
    const principalAuths = state.jwtInstances.filter(
      (j) => j.email === principalCreds.serviceAccountEmail,
    );
    expect(principalAuths.length).toBeGreaterThanOrEqual(1);
    expect(principalAuths[0].subject).toBe("sala02@flacso.edu.uy");

    // Verificamos que el fallback usó Legacy (vieja) con sala02, NUNCA web@flacso.edu.uy
    const legacyAuths = state.jwtInstances.filter(
      (j) => j.email === "vieja@flacso-zoom-app.iam.gserviceaccount.com",
    );
    expect(legacyAuths.length).toBeGreaterThanOrEqual(1);
    for (const auth of legacyAuths) {
      expect(auth.subject).toBe("sala02@flacso.edu.uy");
      expect(auth.subject).not.toBe("web@flacso.edu.uy");
    }
  });

  it("sincronizarCohostsGoogleExistente mantiene el host sala02 en fallback", async () => {
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;

    await sincronizarCohostsGoogleExistente(principalCreds, {
      calendarId: "sala02@flacso.edu.uy",
      externalEventId: "evt-1",
      codigoReunion: "abc-defg-hij",
      cohostsAnteriores: [],
      cohostsDeseados: ["docente@flacso.edu.uy"],
    });

    const legacyAuths = state.jwtInstances.filter(
      (j) => j.email === "vieja@flacso-zoom-app.iam.gserviceaccount.com",
    );
    expect(legacyAuths.length).toBeGreaterThanOrEqual(1);
    for (const auth of legacyAuths) {
      expect(auth.subject).toBe("sala02@flacso.edu.uy");
      expect(auth.subject).not.toBe("web@flacso.edu.uy");
    }
  });

  it("configurarEventoMeet en provider para reunión existente hace fallback con el host sala02", async () => {
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;

    const provider = crearGoogleCalendarProvider(principalCreds);
    await provider.configurarEventoMeet(
      {
        titulo: "Clase",
        inicio: new Date(),
        fin: new Date(),
        timezone: "America/Montevideo",
        calendarId: "sala02@flacso.edu.uy",
        calendarEventId: "cal-evt-1",
        cohostEmails: ["docente@flacso.edu.uy"],
      },
      {
        codigoReunion: "abc-defg-hij",
        joinUrl: "https://meet.google.com/abc-defg-hij",
        externalEventId: "cal-evt-1",
        payload: {},
      },
    );

    const legacyAuths = state.jwtInstances.filter(
      (j) => j.email === "vieja@flacso-zoom-app.iam.gserviceaccount.com",
    );
    expect(legacyAuths.length).toBeGreaterThanOrEqual(1);
    expect(legacyAuths[0].subject).toBe("sala02@flacso.edu.uy");
  });

  it("reuniones nuevas NUNCA usan Legacy en fallback aunque falle con Permission denied on resource Member", async () => {
    const provider = crearGoogleCalendarProvider(principalCreds);
    // Simular creación de evento (nuevo provision)
    await provider.crearEventoCalendar({
      titulo: "Nueva Clase",
      inicio: new Date(),
      fin: new Date(),
      timezone: "America/Montevideo",
      calendarId: "sala02@flacso.edu.uy",
      calendarEventId: "nuevo-cal-evt-1",
      cohostEmails: ["docente@flacso.edu.uy"],
      conferenceData: { conferenceId: "abc-defg-hij" },
    });

    // Activamos el fallo en Principal durante configurarEventoMeet
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;

    // Ahora configurarEventoMeet debe fallar inmediatamente SIN intentar Legacy
    await expect(
      provider.configurarEventoMeet(
        {
          titulo: "Nueva Clase",
          inicio: new Date(),
          fin: new Date(),
          timezone: "America/Montevideo",
          calendarId: "sala02@flacso.edu.uy",
          calendarEventId: "nuevo-cal-evt-1",
          cohostEmails: ["docente@flacso.edu.uy"],
        },
        {
          codigoReunion: "abc-defg-hij",
          joinUrl: "https://meet.google.com/abc-defg-hij",
          externalEventId: "nuevo-cal-evt-1",
          payload: {},
        },
      ),
    ).rejects.toThrow("Permission denied on resource Member");

    const legacyAuths = state.jwtInstances.filter(
      (j) => j.email === "vieja@flacso-zoom-app.iam.gserviceaccount.com",
    );
    expect(legacyAuths.length).toBe(0);
  });

  it("errores no relacionados con permisos NO disparan fallback a Legacy", async () => {
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;
    state.failWithCode = 500;
    state.failWithMessage = "500: Internal Server Error";

    await expect(
      configurarGoogleMeetExistente(principalCreds, "abc-defg-hij", {
        cohostEmails: ["docente@flacso.edu.uy"],
      }),
    ).rejects.toThrow("500: Internal Server Error");

    const legacyAuths = state.jwtInstances.filter(
      (j) => j.email === "vieja@flacso-zoom-app.iam.gserviceaccount.com",
    );
    expect(legacyAuths.length).toBe(0);
  });

  it("cargarCredencialesLegacyGoogleWorkspace conserva el subject de Workspace en base de datos para otros servicios (Drive, etc)", async () => {
    const fakeDb = {
      configuracionGoogleWorkspace: {
        findMany: vi.fn(async () => state.legacyRows),
      },
    } as any;

    const rows = await cargarCredencialesLegacyGoogleWorkspace(
      fakeDb,
      (k) => `dec:${k}`,
    );

    expect(rows).toEqual([
      {
        id: "legacy:vieja",
        serviceAccountEmail: "vieja@flacso-zoom-app.iam.gserviceaccount.com",
        privateKey: "dec:cifrada",
        serviceAccountSubject: "web@flacso.edu.uy",
      },
    ]);
  });

  it("configurarGoogleMeetExistente no lanza error cuando tanto Principal como Legacy fallan con Permission denied on resource Member en Meet existente", async () => {
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;
    state.failOnLegacyEmail = "vieja@flacso-zoom-app.iam.gserviceaccount.com";
    state.failOnlyOnMembers = true;
    state.failWithCode = 403;
    state.failWithMessage = "403: Permission denied on resource Member (or it might not exist)";

    await expect(
      configurarGoogleMeetExistente(principalCreds, "abc-defg-hij", {
        cohostEmails: ["docente@flacso.edu.uy"],
      }),
    ).resolves.toBeUndefined();
  });

  it("configurarEventoMeet en provider para reunión existente no lanza error cuando ambas credenciales fallan con Permission denied on resource Member", async () => {
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;
    state.failOnLegacyEmail = "vieja@flacso-zoom-app.iam.gserviceaccount.com";
    state.failOnlyOnMembers = true;
    state.failWithCode = 403;
    state.failWithMessage = "403: Permission denied on resource Member (or it might not exist)";

    const provider = crearGoogleCalendarProvider(principalCreds);
    await expect(
      provider.configurarEventoMeet(
        {
          titulo: "Clase Existente",
          inicio: new Date(),
          fin: new Date(),
          timezone: "America/Montevideo",
          calendarId: "sala02@flacso.edu.uy",
          calendarEventId: "cal-evt-existente",
          cohostEmails: ["docente@flacso.edu.uy"],
        },
        {
          codigoReunion: "abc-defg-hij",
          joinUrl: "https://meet.google.com/abc-defg-hij",
          externalEventId: "cal-evt-existente",
          payload: {},
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("sincronizarCohostsGoogleExistente resuelve exitosamente cuando ambas fallan en members", async () => {
    state.failOnPrincipalEmail = principalCreds.serviceAccountEmail;
    state.failOnLegacyEmail = "vieja@flacso-zoom-app.iam.gserviceaccount.com";
    state.failOnlyOnMembers = true;
    state.failWithCode = 403;
    state.failWithMessage = "403: Permission denied on resource Member (or it might not exist)";

    const payload = await sincronizarCohostsGoogleExistente(principalCreds, {
      calendarId: "sala02@flacso.edu.uy",
      externalEventId: "cal-evt-existente",
      codigoReunion: "abc-defg-hij",
      cohostsAnteriores: [],
      cohostsDeseados: ["docente@flacso.edu.uy"],
    });

    expect(payload).toBeDefined();
  });
});
