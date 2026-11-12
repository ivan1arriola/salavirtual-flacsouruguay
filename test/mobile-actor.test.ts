import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: { sub: "usuario-1", role: "ASISTENTE_TECNICO" as const } as {
    sub: string;
    role: "ASISTENTE_TECNICO";
    v?: number;
    sid?: string;
  } | null,
  sessionExpires: new Date("2100-01-01T00:00:00Z") as Date | null,
  actor: { id: "usuario-1", rol: "ASISTENTE_TECNICO", activo: true } as {
    id: string;
    rol: "ASISTENTE_TECNICO" | "ADMINISTRACION" | "DOCENTE";
    activo: boolean;
  } | null
}));

vi.mock("@/src/lib/auth/config", () => ({ authConfig: { secret: "s".repeat(32) } }));
vi.mock("@/src/lib/auth/mobile-token", () => ({
  mobileActorFromRequest: () => state.token,
  mobileSessionHash: (sid: string) => "hash-" + sid,
  mobileSessionIdentifier: (id: string) => "mobile-session:" + id
}));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => state.actor
}));
vi.mock("@/src/lib/db", () => ({
  db: {
    tokenVerificacion: {
      findUnique: async () => (state.sessionExpires ? { expires: state.sessionExpires } : null)
    }
  }
}));

import { requireMobileActor } from "../src/lib/auth/mobile-actor.adapter";

beforeEach(() => {
  state.token = { sub: "usuario-1", role: "ASISTENTE_TECNICO" };
  state.actor = { id: "usuario-1", rol: "ASISTENTE_TECNICO", activo: true };
  state.sessionExpires = new Date("2100-01-01T00:00:00Z");
});

describe("requireMobileActor", () => {
  it("acepta un asistente activo con el rol autorizado", async () => {
    await expect(
      requireMobileActor(new Request("https://example.test"), ["ASISTENTE_TECNICO"])
    ).resolves.toMatchObject({ id: "usuario-1", rol: "ASISTENTE_TECNICO" });
  });

  it("rechaza tokens ausentes o inválidos con 401", async () => {
    state.token = null as never;

    await expect(
      requireMobileActor(new Request("https://example.test"), ["ASISTENTE_TECNICO"])
    ).rejects.toMatchObject({ status: 401 });
  });

  it("revoca el acceso si la cuenta fue desactivada", async () => {
    state.actor = { id: "usuario-1", rol: "ASISTENTE_TECNICO", activo: false };

    await expect(
      requireMobileActor(new Request("https://example.test"), ["ASISTENTE_TECNICO"])
    ).rejects.toMatchObject({ status: 403 });
  });

  it("revoca el acceso si el rol cambió desde la emisión", async () => {
    state.actor = { id: "usuario-1", rol: "ADMINISTRACION", activo: true };

    await expect(
      requireMobileActor(new Request("https://example.test"), ["ASISTENTE_TECNICO", "ADMINISTRACION"])
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rechaza un token v2 cuya sesión fue revocada", async () => {
    state.token = { sub: "usuario-1", role: "ASISTENTE_TECNICO", v: 2, sid: "dispositivo" };
    state.sessionExpires = null;
    await expect(
      requireMobileActor(new Request("https://example.test"), ["ASISTENTE_TECNICO"])
    ).rejects.toMatchObject({ status: 401 });
  });
});
