import { describe, expect, it, vi } from "vitest";
import { obtenerReunionOperativa } from "../src/modules/asistencia/reunion-operativa.service";

const ahora = new Date("2026-09-16T21:45:00.000Z");

describe("obtenerReunionOperativa", () => {
  it("devuelve EN_CURSO solo cuando Meet confirma la conferencia", async () => {
    const deps = {
      db: {
        eventoProveedor: {
          findFirst: vi.fn(async () => ({
            codigoReunion: "abc-defg-hij",
            joinUrl: "https://meet.google.com/abc-defg-hij",
            cuentaProveedor: { emailOrganizador: "sala03@flacso.edu.uy" },
            instancia: {
              id: "instancia-1",
              inicioProgramadoAt: new Date("2026-09-16T21:30:00.000Z"),
              finProgramadoAt: new Date("2026-09-16T23:00:00.000Z")
            }
          }))
        },
        configuracionGoogleWorkspace: {
          findUnique: vi.fn(async () => ({
            activa: true,
            serviceAccountEmail: "service@example.iam.gserviceaccount.com",
            privateKeyCifrada: "cifrada"
          }))
        }
      },
      descifrar: vi.fn(() => "private-key"),
      crearClient: vi.fn(() => ({})),
      obtenerSnapshot: vi.fn(async () => ({
        conferenceName: "conferenceRecords/1",
        startedAt: new Date("2026-09-16T21:42:00.000Z"),
        endedAt: null,
        participants: [{
          sessionId: "participants/1/participantSessions/a",
          displayName: "Docente Uno",
          joinedAt: new Date("2026-09-16T21:43:00.000Z"),
          leftAt: null,
          active: true
        }],
        recording: { status: "NO_INICIADA" as const, url: null }
      }))
    };

    const result = await obtenerReunionOperativa(deps as never, "instancia-1", ahora);

    expect(result).toMatchObject({
      estado: "EN_CURSO",
      conferenceName: "conferenceRecords/1",
      participantCount: 1,
      activeParticipantCount: 1,
      recording: { status: "NO_INICIADA", url: null }
    });
  });

  it("queda ESPERANDO_INICIO cuando llegó la hora pero Meet todavía no empezó", async () => {
    const deps = {
      db: {
        eventoProveedor: {
          findFirst: vi.fn(async () => ({
            codigoReunion: "abc-defg-hij",
            joinUrl: "https://meet.google.com/abc-defg-hij",
            cuentaProveedor: { emailOrganizador: "sala03@flacso.edu.uy" },
            instancia: {
              id: "instancia-1",
              inicioProgramadoAt: new Date("2026-09-16T21:30:00.000Z"),
              finProgramadoAt: new Date("2026-09-16T23:00:00.000Z")
            }
          }))
        },
        configuracionGoogleWorkspace: {
          findUnique: vi.fn(async () => ({
            activa: true,
            serviceAccountEmail: "service@example.iam.gserviceaccount.com",
            privateKeyCifrada: "cifrada"
          }))
        }
      },
      descifrar: vi.fn(() => "private-key"),
      crearClient: vi.fn(() => ({})),
      obtenerSnapshot: vi.fn(async () => null)
    };

    const result = await obtenerReunionOperativa(deps as never, "instancia-1", ahora);

    expect(result.estado).toBe("ESPERANDO_INICIO");
    expect(result.participantCount).toBe(0);
  });

  it("informa SIN_MEET sin consultar Google", async () => {
    const deps = {
      db: {
        eventoProveedor: { findFirst: vi.fn(async () => null) },
        configuracionGoogleWorkspace: { findUnique: vi.fn() }
      },
      descifrar: vi.fn(),
      crearClient: vi.fn(),
      obtenerSnapshot: vi.fn()
    };

    const result = await obtenerReunionOperativa(deps as never, "instancia-1", ahora);

    expect(result.disponibilidad).toEqual({ estado: "NO_DISPONIBLE", motivo: "SIN_MEET" });
    expect(deps.obtenerSnapshot).not.toHaveBeenCalled();
  });
});
