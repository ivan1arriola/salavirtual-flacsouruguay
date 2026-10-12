import { beforeEach, describe, expect, it, vi } from "vitest";

const tracking = vi.hoisted(() => ({ events: [] as string[] }));

vi.mock("@/auth", () => ({
  signOut: async (options: { redirect: boolean }) => {
    tracking.events.push(`signOut:${options.redirect}`);
  },
  signIn: async (
    provider: string,
    options: { redirectTo: string },
    params?: { login_hint?: string }
  ) => {
    tracking.events.push(`signIn:${provider}:${options.redirectTo}:${params?.login_hint ?? ""}`);
  }
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { iniciarSesionGoogle, iniciarSesionGoogleRecordada } from "../app/acceso/actions";

describe("Google OAuth: iniciar una sesión nueva sin conservar JWT obsoletos", () => {
  beforeEach(() => {
    tracking.events.length = 0;
  });

  it("borra la cookie de sesión antes de comenzar OAuth", async () => {
    await iniciarSesionGoogle();
    expect(tracking.events).toEqual([
      "signOut:false",
      "signIn:google:/:"
    ]);
  });

  it("borra la sesión antes de cambiar a una cuenta Google recordada", async () => {
    const formData = new FormData();
    formData.set("loginHint", "docente@flacso.edu.uy");
    await iniciarSesionGoogleRecordada(formData);
    expect(tracking.events).toEqual([
      "signOut:false",
      "signIn:google:/:docente@flacso.edu.uy"
    ]);
  });

  it("no agrega parámetros innecesarios si no hay cuenta recordada", async () => {
    await iniciarSesionGoogleRecordada(new FormData());
    expect(tracking.events).toEqual([
      "signOut:false",
      "signIn:google:/:"
    ]);
  });
});
