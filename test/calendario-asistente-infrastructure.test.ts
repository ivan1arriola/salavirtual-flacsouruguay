import { describe, expect, it, vi } from "vitest";
import {
  crearGoogleAssistantCalendarProvider,
  crearPrismaAssistantCalendarRepository,
  eliminarEventoCalendarioAsistente,
  publicarEventoCalendarioAsistente
} from "../src/modules/asistencia/infrastructure";

vi.mock("@/src/integrations/google", () => ({
  crearGoogleCalendarAuthClient: vi.fn().mockReturnValue({ id: "mock-auth" }),
  crearEventoCalendarHttp: vi.fn(),
  obtenerEventoCalendarSiExiste: vi.fn(),
  actualizarEventoCalendarHttp: vi.fn(),
  eliminarEventoCalendarHttp: vi.fn(),
  isAlreadyCalendarEventError: vi.fn((err: any) => err?.code === 409 || err?.status === 409),
  isCalendarNotFoundError: vi.fn((err: any) => err?.code === 404 || err?.status === 404)
}));

import {
  actualizarEventoCalendarHttp,
  crearEventoCalendarHttp,
  eliminarEventoCalendarHttp,
  obtenerEventoCalendarSiExiste
} from "@/src/integrations/google";

describe("adaptador Google Assistant Calendar Provider", () => {
  const credentials = {
    serviceAccountEmail: "sa@flacso.edu.uy",
    privateKey: "pk-123",
    subject: "asistente@flacso.edu.uy"
  };

  const sampleEvent = {
    id: "evt-1",
    titulo: "Asistencia Clase 1",
    descripcion: "Detalles",
    inicio: new Date("2026-10-01T17:00:00Z"),
    fin: new Date("2026-10-01T20:30:00Z"),
    reunionInicio: new Date("2026-10-01T18:00:00Z"),
    reunionFin: new Date("2026-10-01T20:00:00Z"),
    modalidad: "HIBRIDA" as const,
    tipo: "REUNION" as const,
    timezone: "America/Montevideo",
    instanciaSalaId: "inst-1",
    programa: "Maestría",
    docente: "Prof. García",
    joinUrl: "https://meet.google.com/abc-defg-hij"
  };

  it("crea el evento en Calendar primario del asistente", async () => {
    vi.mocked(crearEventoCalendarHttp).mockResolvedValueOnce({} as any);

    await publicarEventoCalendarioAsistente(credentials, sampleEvent);

    expect(crearEventoCalendarHttp).toHaveBeenCalledWith(
      expect.anything(),
      "primary",
      expect.objectContaining({
        id: "evt-1",
        summary: "Asistencia Clase 1",
        location: "https://meet.google.com/abc-defg-hij",
        extendedProperties: {
          private: {
            flacsoTipo: "ASISTENCIA_TECNICA",
            flacsoInstanciaSalaId: "inst-1"
          }
        }
      }),
      { sendUpdates: "none" }
    );
  });

  it("si ya existe (409), actualiza mediante PATCH", async () => {
    vi.mocked(crearEventoCalendarHttp).mockRejectedValueOnce({ code: 409 });
    vi.mocked(actualizarEventoCalendarHttp).mockResolvedValueOnce({} as any);

    await publicarEventoCalendarioAsistente(credentials, sampleEvent);

    expect(actualizarEventoCalendarHttp).toHaveBeenCalledWith(
      expect.anything(),
      "primary",
      "evt-1",
      expect.not.objectContaining({ id: "evt-1" }),
      { sendUpdates: "none" }
    );
  });

  it("recupera una creación confirmada por GET cuando se perdió el POST", async () => {
    const timeout = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    vi.mocked(crearEventoCalendarHttp).mockRejectedValueOnce(timeout);
    vi.mocked(obtenerEventoCalendarSiExiste).mockResolvedValueOnce({ id: "evt-1" });
    vi.mocked(actualizarEventoCalendarHttp).mockResolvedValueOnce({ id: "evt-1" });

    await publicarEventoCalendarioAsistente(credentials, sampleEvent);

    expect(obtenerEventoCalendarSiExiste).toHaveBeenCalledWith(expect.anything(), "primary", "evt-1");
    expect(actualizarEventoCalendarHttp).toHaveBeenCalledWith(
      expect.anything(),
      "primary",
      "evt-1",
      expect.anything(),
      { sendUpdates: "none" }
    );
  });

  it("no repite POST cuando Calendar no permite confirmar la creación", async () => {
    const timeout = Object.assign(new Error("socket hang up"), { code: "ETIMEDOUT" });
    const before = vi.mocked(crearEventoCalendarHttp).mock.calls.length;
    vi.mocked(crearEventoCalendarHttp).mockRejectedValueOnce(timeout);
    vi.mocked(obtenerEventoCalendarSiExiste).mockResolvedValueOnce(null);

    await expect(publicarEventoCalendarioAsistente(credentials, sampleEvent)).rejects.toBe(timeout);
    expect(vi.mocked(crearEventoCalendarHttp).mock.calls.length - before).toBe(1);
  });

  it("elimina el evento con sendUpdates: none", async () => {
    vi.mocked(eliminarEventoCalendarHttp).mockResolvedValueOnce(undefined);

    await eliminarEventoCalendarioAsistente(credentials, "evt-1");

    expect(eliminarEventoCalendarHttp).toHaveBeenCalledWith(expect.anything(), "primary", "evt-1", {
      sendUpdates: "none"
    });
  });

  it("ignora errores 404 y 410 al eliminar", async () => {
    vi.mocked(eliminarEventoCalendarHttp).mockRejectedValueOnce({ code: 404 });
    await expect(eliminarEventoCalendarioAsistente(credentials, "evt-404")).resolves.toBeUndefined();

    vi.mocked(eliminarEventoCalendarHttp).mockRejectedValueOnce({ code: 410 });
    await expect(eliminarEventoCalendarioAsistente(credentials, "evt-410")).resolves.toBeUndefined();
  });

  it("lanza errores no 404/410 al eliminar", async () => {
    vi.mocked(eliminarEventoCalendarHttp).mockRejectedValueOnce({
      code: 500,
      message: "Internal Server Error"
    });
    await expect(eliminarEventoCalendarioAsistente(credentials, "evt-500")).rejects.toMatchObject({
      code: 500
    });
  });

  it("crearGoogleAssistantCalendarProvider expone interfaz port", () => {
    const provider = crearGoogleAssistantCalendarProvider();
    expect(typeof provider.publicarEvento).toBe("function");
    expect(typeof provider.eliminarEvento).toBe("function");
  });
});

describe("adaptador Prisma Assistant Calendar Repository", () => {
  it("obtiene y mapea la instancia para calendario", async () => {
    const mockDb = {
      instanciaSala: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inst-1",
          estado: "PROGRAMADA",
          requiereAsistenciaTecnica: true,
          inicioProgramadoAt: new Date("2026-10-01T18:00:00Z"),
          finProgramadoAt: new Date("2026-10-01T20:00:00Z"),
          modalidadOverride: "HIBRIDA",
          inicioAsistenciaTecnicaAt: new Date("2026-10-01T17:00:00Z"),
          finAsistenciaTecnicaAt: new Date("2026-10-01T20:30:00Z"),
          timezone: "America/Montevideo",
          descripcion: "Clase magistral",
          solicitud: {
            titulo: "Diplomatura",
            descripcion: "Curso online",
            modalidad: "VIRTUAL",
            docentePrograma: {
              programa: { nombre: "Políticas Públicas" },
              docente: {
                usuario: { nombres: "Ana", apellidos: "García" }
              }
            }
          },
          eventosProveedor: [
            { joinUrl: "https://meet.google.com/abc-defg-hij", proveedor: { tipo: "GOOGLE_MEET" } }
          ],
          asignaciones: []
        })
      }
    };

    const repo = crearPrismaAssistantCalendarRepository({
      db: mockDb as any,
      descifrar: (v) => v
    });

    const instancia = await repo.obtenerInstanciaParaCalendario("inst-1");
    expect(instancia).not.toBeNull();
    expect(instancia?.solicitudTitulo).toBe("Diplomatura");
    expect(instancia?.docenteNombreCompleto).toBe("Ana García");
    expect(instancia?.programaNombre).toBe("Políticas Públicas");
    expect(instancia?.joinUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(instancia?.modalidad).toBe("HIBRIDA");
    expect(instancia?.inicioAsistenciaTecnicaAt).toEqual(new Date("2026-10-01T17:00:00Z"));
    expect(instancia?.finAsistenciaTecnicaAt).toEqual(new Date("2026-10-01T20:30:00Z"));
  });

  it("obtiene y descifra credenciales de Google Workspace", async () => {
    const mockDb = {
      configuracionGoogleWorkspace: {
        findUnique: vi.fn().mockResolvedValue({
          activa: true,
          serviceAccountEmail: "sa@flacso.edu.uy",
          privateKeyCifrada: "encrypted-key"
        })
      }
    };

    const repo = crearPrismaAssistantCalendarRepository({
      db: mockDb as any,
      descifrar: (val) => `decrypted-${val}`
    });

    const creds = await repo.obtenerCredencialesWorkspace();
    expect(creds).toEqual({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "decrypted-encrypted-key"
    });
  });

  it("retorna null si las credenciales no estan activas o no existen", async () => {
    const mockDb = {
      configuracionGoogleWorkspace: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    };

    const repo = crearPrismaAssistantCalendarRepository({
      db: mockDb as any,
      descifrar: (val) => val
    });

    const creds = await repo.obtenerCredencialesWorkspace();
    expect(creds).toBeNull();
  });
});
