import { beforeEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({
  options: [] as Array<Record<string, unknown>>,
  authorize: vi.fn(),
  request: vi.fn()
}));

vi.mock("google-auth-library", () => ({
  JWT: class JWT {
    private readonly options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      google.options.push(options);
    }

    authorize() {
      return google.authorize(this.options);
    }

    request(options: Record<string, unknown>) {
      return google.request(options, this.options);
    }
  }
}));

import {
  prepararAccesoSalasDrive,
  probarCredencialGoogle,
  probarDelegacionGoogle,
  probarDestinoDrive,
  validarScopesGoogle
} from "../src/modules/configuracion/google-workspace-test.adapter";

const credential = {
  serviceAccountEmail: "service@project.iam.gserviceaccount.com",
  privateKey: "private-key",
  subject: "sala03@flacso.edu.uy"
};

const scopes = {
  calendar: "https://www.googleapis.com/auth/calendar.events",
  drive: "https://www.googleapis.com/auth/drive",
  meetSettings: "https://www.googleapis.com/auth/meetings.space.settings",
  meetRead: "https://www.googleapis.com/auth/meetings.space.readonly",
  meetCreated: "https://www.googleapis.com/auth/meetings.space.created",
  gmail: "https://www.googleapis.com/auth/gmail.send",
  sheets: "https://www.googleapis.com/auth/spreadsheets"
};

beforeEach(() => {
  google.options.length = 0;
  google.authorize.mockReset().mockResolvedValue({});
  google.request.mockReset().mockResolvedValue({ data: {} });
});

describe("pruebas de Google Workspace", () => {
  it("valida la cuenta de servicio solicitando únicamente Calendar", async () => {
    await expect(probarCredencialGoogle({
      serviceAccountEmail: credential.serviceAccountEmail,
      privateKey: credential.privateKey
    })).resolves.toContain("Google aceptó");

    expect(google.authorize).toHaveBeenCalledOnce();
    expect(google.options[0]).toMatchObject({
      email: credential.serviceAccountEmail,
      key: credential.privateKey,
      scopes: [scopes.calendar]
    });
  });

  it("prueba la delegación con todos los scopes requeridos y el usuario delegado", async () => {
    await expect(probarDelegacionGoogle(credential)).resolves.toContain(credential.subject);

    expect(google.options[0]).toMatchObject({
      subject: credential.subject,
      scopes: [scopes.calendar, scopes.drive, scopes.meetSettings, scopes.meetRead, scopes.meetCreated, scopes.gmail, scopes.sheets]
    });
    expect(google.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining(encodeURIComponent(credential.subject))
      }),
      expect.anything()
    );
  });

  it("valida los siete scopes por separado", async () => {
    const result = await validarScopesGoogle(credential);

    expect(result).toHaveLength(7);
    expect(result.every(({ autorizado }) => autorizado)).toBe(true);
    expect(google.authorize).toHaveBeenCalledTimes(7);
    expect(google.options.map(({ scopes: requested }) => requested)).toEqual([
      [scopes.calendar],
      [scopes.drive],
      [scopes.meetSettings],
      [scopes.meetRead],
      [scopes.meetCreated],
      [scopes.gmail],
      [scopes.sheets]
    ]);
  });

  it("identifica individualmente scopes no delegados o bloqueados por política", async () => {
    google.authorize.mockImplementation(async (options: Record<string, unknown>) => {
      const requested = options.scopes as readonly string[];
      if (requested.includes(scopes.meetSettings)) throw new Error("unauthorized_client");
      if (requested.includes(scopes.gmail)) throw new Error("admin_policy_enforced");
      return {};
    });

    const result = await validarScopesGoogle(credential);
    const settings = result.find(({ key }) => key === "meetings.space.settings");
    const gmail = result.find(({ key }) => key === "gmail.send");

    expect(settings).toMatchObject({
      autorizado: false,
      error: "No autorizado en la delegación de todo el dominio."
    });
    expect(gmail).toMatchObject({
      autorizado: false,
      error: "Bloqueado por una política de Google Workspace."
    });
    expect(result.filter(({ autorizado }) => autorizado)).toHaveLength(5);
  });

  it("conserva el detalle de un error de scope desconocido", async () => {
    google.authorize.mockRejectedValue(new Error("fallo inesperado"));
    const result = await validarScopesGoogle(credential);

    expect(result.every(({ error }) => error === "fallo inesperado")).toBe(true);
  });
});

describe("pruebas de Google Drive", () => {
  it("confirma lectura y escritura creando y eliminando una carpeta temporal", async () => {
    google.request.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.method === "GET") {
        return { data: { id: "folder", name: "Grabaciones", mimeType: "application/vnd.google-apps.folder", trashed: false } };
      }
      if (request.method === "POST") return { data: { id: "probe" } };
      return { data: {} };
    });

    await expect(probarDestinoDrive(credential, "folder")).resolves.toContain("Grabaciones");
    expect(google.request.mock.calls.map(([request]) => request.method)).toEqual(["GET", "POST", "DELETE"]);
  });

  it("rechaza IDs que no son carpetas disponibles", async () => {
    google.request.mockResolvedValueOnce({
      data: { id: "file", mimeType: "text/plain", trashed: false }
    });
    await expect(probarDestinoDrive(credential, "file")).rejects.toThrow("no corresponde a una carpeta");

    google.request.mockResolvedValueOnce({
      data: { id: "folder", mimeType: "application/vnd.google-apps.folder", trashed: true }
    });
    await expect(probarDestinoDrive(credential, "folder")).rejects.toThrow("no corresponde a una carpeta");
  });

  it("falla si Drive no devuelve ID para la prueba de escritura", async () => {
    google.request
      .mockResolvedValueOnce({ data: { id: "folder", mimeType: "application/vnd.google-apps.folder", trashed: false } })
      .mockResolvedValueOnce({ data: {} });

    await expect(probarDestinoDrive(credential, "folder")).rejects.toThrow("no confirmó la prueba de escritura");
  });

  it("envía la carpeta temporal a la papelera si no puede eliminarla", async () => {
    google.request.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.method === "GET") {
        return { data: { id: "folder", mimeType: "application/vnd.google-apps.folder", trashed: false } };
      }
      if (request.method === "POST") return { data: { id: "probe" } };
      if (request.method === "DELETE") throw new Error("delete denied");
      return { data: {} };
    });

    await expect(probarDestinoDrive(credential, "folder")).resolves.toContain("folder");
    expect(google.request.mock.calls.map(([request]) => request.method)).toEqual(["GET", "POST", "DELETE", "PATCH"]);
    expect(google.request.mock.calls[3]?.[0]).toMatchObject({ data: { trashed: true } });
  });

  it("solo agrega permisos a las salas que todavía no pueden escribir", async () => {
    google.request
      .mockResolvedValueOnce({
        data: {
          permissions: [
            { id: "1", emailAddress: "SALA01@FLACSO.EDU.UY", role: "writer" },
            { id: "2", emailAddress: "sala02@flacso.edu.uy", role: "reader" }
          ]
        }
      })
      .mockResolvedValue({ data: { id: "permission" } });

    await expect(prepararAccesoSalasDrive(credential, "folder", [
      "sala01@flacso.edu.uy",
      "sala02@flacso.edu.uy",
      "sala03@flacso.edu.uy"
    ])).resolves.toBe("1 salas ya tenían acceso; 2 fueron habilitadas con administración de contenido.");

    const posts = google.request.mock.calls
      .map(([request]) => request as Record<string, unknown>)
      .filter(({ method }) => method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts.map(({ data }) => (data as { emailAddress: string }).emailAddress)).toEqual([
      "sala02@flacso.edu.uy",
      "sala03@flacso.edu.uy"
    ]);
  });
});
