import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  requireMobileActor: vi.fn(),
  assistantFindUnique: vi.fn(),
  meetingsFindMany: vi.fn(),
  updateInterest: vi.fn()
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200
    })
  }
}));
vi.mock("@/src/lib/auth/mobile-actor.adapter", () => ({
  MobileActorError: class MobileActorError extends Error {
    constructor(
      message: string,
      public readonly status: 401 | 403
    ) {
      super(message);
    }
  },
  requireMobileActor: (...args: unknown[]) => mock.requireMobileActor(...args)
}));
vi.mock("@/src/lib/db", () => ({
  db: {
    asistenteTecnico: { findUnique: mock.assistantFindUnique },
    instanciaSala: { findMany: mock.meetingsFindMany },
    asignacionAsistenciaTecnica: { findMany: vi.fn() },
    postulacionAsistenciaTecnica: { findMany: vi.fn() }
  }
}));
vi.mock("@/src/modules/asistencia/asistencia.service", () => ({
  actualizarPostulacionAsistencia: (...args: unknown[]) => mock.updateInterest(...args)
}));

import { GET, PUT } from "../app/api/v1/mobile/agenda-abierta/route";
import { MobileActorError } from "../src/lib/auth/mobile-actor.adapter";

const request = () => new Request("https://example.test/api/v1/mobile/agenda-abierta");
beforeEach(() => {
  mock.requireMobileActor.mockReset();
  mock.assistantFindUnique.mockReset();
  mock.meetingsFindMany.mockReset();
  mock.updateInterest.mockReset();
});

describe("F9: contrato de permisos de agenda móvil", () => {
  for (const [name, invoke] of [
    ["GET", () => GET(request())],
    ["PUT", () => PUT(new Request(request().url, { method: "PUT", body: "{}" }))]
  ] as const) {
    it(`${name} responde 401 para token inválido`, async () => {
      mock.requireMobileActor.mockRejectedValueOnce(new MobileActorError("Inválido", 401));
      expect(((await invoke()) as { status: number }).status).toBe(401);
      expect(mock.assistantFindUnique).not.toHaveBeenCalled();
    });
    it(`${name} responde 403 para rol no autorizado`, async () => {
      mock.requireMobileActor.mockRejectedValueOnce(new MobileActorError("Prohibido", 403));
      expect(((await invoke()) as { status: number }).status).toBe(403);
      expect(mock.assistantFindUnique).not.toHaveBeenCalled();
    });
    it(`${name} responde 403 a un asistente cesado`, async () => {
      mock.requireMobileActor.mockResolvedValueOnce({ id: "a", rol: "ASISTENTE_TECNICO", activo: true });
      mock.assistantFindUnique.mockResolvedValueOnce({
        id: "assistant-a",
        cesadoHastaProximoInicioSesion: true
      });
      expect(((await invoke()) as { status: number }).status).toBe(403);
      expect(mock.meetingsFindMany).not.toHaveBeenCalled();
      expect(mock.updateInterest).not.toHaveBeenCalled();
    });
    it(`${name} propaga fallos internos en vez de convertirlos en 401`, async () => {
      mock.requireMobileActor.mockRejectedValueOnce(new Error("database unavailable"));
      await expect(invoke()).rejects.toThrow("database unavailable");
    });
  }
});
