import { beforeEach, describe, it, vi } from "vitest";
import assert from "node:assert/strict";

const google = vi.hoisted(() => ({
  calls: [] as Array<Record<string, any>>,
  members: [] as Array<{ name: string; email: string; role: string }>,
  moderation: "ON",
  rejectPost: false,
  rejectPatch: false,
  ignorePost: false,
  code: "abc-defg-hij" as string | null
}));
vi.mock("google-auth-library", () => ({
  JWT: class {
    subject: string;
    constructor(options: { subject: string }) {
      this.subject = options.subject;
    }
    async request(options: Record<string, any>) {
      google.calls.push({ ...options, subject: this.subject });
      const url = new URL(options.url);
      if (url.hostname === "www.googleapis.com") {
        return {
          data: {
            id: "event",
            attendees: [],
            hangoutLink: `https://meet.google.com/${google.code}`,
            conferenceData: google.code ? { conferenceId: google.code } : null
          }
        };
      }
      if (url.pathname.endsWith("/members") && options.method === "GET") {
        // Deliberately paginate. Confirmation must inspect all pages.
        return {
          data: url.searchParams.has("pageToken")
            ? { members: google.members.slice(1) }
            : {
                members: google.members.slice(0, 1),
                ...(google.members.length > 1 ? { nextPageToken: "next" } : {})
              }
        };
      }
      if (url.pathname.endsWith("/members") && options.method === "POST") {
        if (google.rejectPost) {
          throw new Error("403: insufficient authentication scopes");
        }
        if (google.members.some((member) => member.email === options.data.email)) {
          throw { code: 409 };
        }
        if (!google.ignorePost) {
          google.members.push({ name: `spaces/space/members/${google.members.length + 1}`, ...options.data });
        }
        return { data: options.data };
      }
      if (options.method === "PATCH" && url.pathname.includes("/members/")) {
        if (google.rejectPatch) {
          const err = new Error("No tenés permisos para modificar el rol de este miembro.");
          (err as any).code = 403;
          throw err;
        }
        const member = google.members.find((item) => `/v2/${item.name}` === url.pathname);
        if (!member) {
          throw { code: 404 };
        }
        member.role = options.data.role;
        return { data: member };
      }
      if (options.method === "DELETE") {
        google.members = google.members.filter((member) => `/v2/${member.name}` !== url.pathname);
        return { data: {} };
      }
      return { data: { name: "spaces/space", config: { moderation: google.moderation } } };
    }
  }
}));

import {
  configurarGoogleMeetExistente,
  crearGoogleCalendarProvider,
  sincronizarCohostsGoogleExistente
} from "../src/modules/meet/google-calendar.adapter";
import {
  cohostsConfirmados,
  detalleCohostsVerificados,
  invalidarVerificacionCohosts,
  registrarVerificacionCohosts
} from "../src/modules/meet/cohost-verification.domain";
import { requiereAtencionIntegracionMeet } from "../src/modules/meet/integration-health.domain";

const credentials = {
  serviceAccountEmail: "service@example.iam.gserviceaccount.com",
  privateKey: "test-only",
  subject: "sala01@flacso.edu.uy"
};
const teacher = "docente@gmail.com";
const assistant = "tecnico@otra.edu.uy";

beforeEach(() => {
  google.calls = [];
  google.members = [];
  google.moderation = "ON";
  google.rejectPost = false;
  google.rejectPatch = false;
  google.ignorePost = false;
  google.code = "abc-defg-hij";
});

describe("asignación real de cohosts", () => {
  it("usa la API estable v2 de members para asignar cohosts inmediatamente", async () => {
    await configurarGoogleMeetExistente(credentials, "abc-defg-hij", { cohostEmails: [teacher] });
    const memberCalls = google.calls.filter((call) => new URL(call.url).pathname.includes("/members"));
    assert.ok(memberCalls.length > 0);
    assert.ok(memberCalls.every((call) => new URL(call.url).pathname.startsWith("/v2/")));
  });

  it("asigna docentes Gmail y asistentes externos, manteniendo la sala como organizadora", async () => {
    await configurarGoogleMeetExistente(credentials, "abc-defg-hij", {
      cohostEmails: [teacher, assistant, credentials.subject, ` ${teacher.toUpperCase()} `]
    });
    assert.deepEqual(
      google.members.map(({ email, role }) => ({ email, role })),
      [
        { email: teacher, role: "COHOST" },
        { email: assistant, role: "COHOST" }
      ]
    );
    assert.ok(google.calls.every((call) => call.subject === credentials.subject));
    assert.ok(google.calls.some((call) => call.url.includes("pageToken=next")));
  });

  it("promueve un miembro existente en lugar de aceptar 409 como prueba de cohost", async () => {
    google.members = [{ name: "spaces/space/members/teacher", email: teacher, role: "ROLE_UNSPECIFIED" }];
    await configurarGoogleMeetExistente(credentials, "abc-defg-hij", { cohostEmails: [teacher] });
    assert.equal(google.members[0].role, "COHOST");
    assert.equal(
      google.calls.filter(
        (call) => call.method === "PATCH" && new URL(call.url).pathname.includes("/members/")
      ).length,
      1
    );
    assert.equal(google.calls.filter((call) => call.method === "DELETE").length, 0);
  });

  it("recrea el miembro con DELETE+POST si Google Meet rechaza PATCH con 'No tenés permisos para modificar el rol de este miembro.'", async () => {
    google.members = [{ name: "spaces/space/members/teacher", email: teacher, role: "ROLE_UNSPECIFIED" }];
    google.rejectPatch = true;
    await configurarGoogleMeetExistente(credentials, "abc-defg-hij", { cohostEmails: [teacher] });
    assert.equal(google.members[0].role, "COHOST");
    assert.equal(google.calls.filter((call) => call.method === "DELETE").length, 1);
  });

  it("no borra un miembro que ya tiene el rol correcto", async () => {
    google.members = [{ name: "spaces/space/members/teacher", email: teacher, role: "COHOST" }];
    await configurarGoogleMeetExistente(credentials, "abc-defg-hij", { cohostEmails: [teacher] });
    assert.equal(google.calls.filter((call) => call.method === "DELETE").length, 0);
  });

  it("rechaza una respuesta exitosa si Google no guardó el rol", async () => {
    google.ignorePost = true;
    await assert.rejects(
      configurarGoogleMeetExistente(credentials, "abc-defg-hij", { cohostEmails: [teacher] }),
      /no confirmó los cohosts/
    );
  });

  it("no oculta errores de permisos del proyecto", async () => {
    google.rejectPost = true;
    await assert.rejects(
      configurarGoogleMeetExistente(credentials, "abc-defg-hij", { cohostEmails: [teacher] }),
      /insufficient authentication scopes/
    );
  });

  it("requiere que la administración de anfitriones esté activada realmente", async () => {
    google.moderation = "OFF";
    await assert.rejects(
      configurarGoogleMeetExistente(credentials, "abc-defg-hij", { cohostEmails: [teacher] }),
      /administración de anfitriones/
    );
    assert.equal(google.members.length, 0);
  });

  it("también verifica los encuentros que reutilizan un espacio ya creado", async () => {
    google.ignorePost = true;
    const provider = crearGoogleCalendarProvider(credentials);
    await assert.rejects(
      provider.configurarEventoMeet(
        {
          titulo: "Clase",
          inicio: new Date(),
          fin: new Date(),
          timezone: "UTC",
          calendarId: credentials.subject,
          calendarEventId: "id",
          cohostEmails: [teacher]
        },
        {
          externalEventId: "event",
          codigoReunion: "abc-defg-hij",
          joinUrl: "https://meet.google.com/abc-defg-hij",
          payload: {}
        }
      ),
      /no confirmó los cohosts/
    );
  });

  it("resuelve el código desde Calendar cuando falta o el dato local está desactualizado", async () => {
    const payload = await sincronizarCohostsGoogleExistente(credentials, {
      calendarId: credentials.subject,
      externalEventId: "event",
      codigoReunion: "old-code",
      cohostsAnteriores: [],
      cohostsDeseados: [teacher]
    });
    assert.ok(google.calls.some((call) => call.url.endsWith("/spaces/abc-defg-hij")));
    assert.ok(!google.calls.some((call) => call.url.includes("old-code")));
    assert.equal(cohostsConfirmados(payload, google.code, credentials.subject, [teacher]), true);
  });

  it("rechaza la sincronización si Calendar no identifica un Meet", async () => {
    google.code = null;
    await assert.rejects(
      sincronizarCohostsGoogleExistente(credentials, {
        calendarId: credentials.subject,
        externalEventId: "event",
        cohostsAnteriores: [],
        cohostsDeseados: [teacher]
      }),
      /no confirmó el espacio Meet/
    );
  });
});

describe("estado visible de los cohosts", () => {
  it("no confunde datos locales o invitaciones Calendar con permisos verificados", () => {
    assert.equal(
      cohostsConfirmados({ attendees: [{ email: teacher }] }, google.code, credentials.subject, [teacher]),
      false
    );
    assert.equal(cohostsConfirmados(null, google.code, credentials.subject, [teacher]), false);
  });
  it("conserva metadatos y exige evidencia del mismo espacio, host y correos", () => {
    const payload = registrarVerificacionCohosts(
      { salaVirtual: { invitadosEmails: ["alumno@gmail.com"] } },
      google.code!,
      credentials.subject,
      [teacher],
      "2026-09-11T15:00:00Z"
    );
    assert.deepEqual((payload.salaVirtual as Record<string, unknown>).invitadosEmails, ["alumno@gmail.com"]);
    assert.equal(cohostsConfirmados(payload, google.code, credentials.subject, [teacher]), true);
    assert.equal(cohostsConfirmados(payload, "otro", credentials.subject, [teacher]), false);
    assert.equal(cohostsConfirmados(payload, google.code, "sala02@flacso.edu.uy", [teacher]), false);
    assert.equal(cohostsConfirmados(payload, google.code, credentials.subject, [teacher, assistant]), false);
    assert.equal(
      cohostsConfirmados(invalidarVerificacionCohosts(payload), google.code, credentials.subject, [teacher]),
      false
    );
  });
  it("discrimina cohosts confirmados de pendientes cuando se agrega un nuevo cohost no verificado", () => {
    const payload = registrarVerificacionCohosts(
      {},
      google.code!,
      credentials.subject,
      [teacher],
      "2026-09-11T15:00:00Z"
    );
    const detalle = detalleCohostsVerificados(payload, google.code, credentials.subject, [
      teacher,
      assistant
    ]);
    assert.equal(detalle.confirmados, false);
    assert.deepEqual(detalle.emailsConfirmados, [teacher]);
    assert.deepEqual(detalle.emailsPendientes, [assistant]);
  });
  it("muestra fallos de scopes incluso en reuniones con enlace y estado sincronizado", () => {
    for (const estadoIntegracion of ["SINCRONIZADA", "ERROR"] as const) {
      assert.equal(
        requiereAtencionIntegracionMeet({
          estadoIntegracion,
          joinUrl: "https://meet.google.com/abc-defg-hij",
          errorIntegracion: "insufficient authentication scopes"
        }),
        true
      );
    }
  });
});
