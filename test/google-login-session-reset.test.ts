import { beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarGoogleConSesionLimpia } from "../src/lib/auth/google-login-browser-flow";

describe("OAuth Google: cerrar la sesión en una solicitud anterior al signIn", () => {
  const order: string[] = [];

  beforeEach(() => {
    order.length = 0;
  });

  const cerrarSesion = vi.fn(async (opts: { redirect: false }) => {
    order.push(`logout:${opts.redirect}`);
  });

  const iniciarSesion = vi.fn(async (
    provider: "google",
    options: { redirectTo: "/" },
    hint?: { login_hint: string }
  ) => {
    order.push(`login:${provider}:${options.redirectTo}:${hint?.login_hint ?? ""}`);
  });

  it("espera la invalidación de la cookie antes de iniciar Google", async () => {
    let terminarLogout!: () => void;
    const detenerLogout = vi.fn(() => new Promise<void>(resolve => {
      terminarLogout = resolve;
    }));
    const intento = iniciarGoogleConSesionLimpia(detenerLogout, iniciarSesion);
    expect(detenerLogout).toHaveBeenCalledWith({ redirect: false });
    expect(iniciarSesion).not.toHaveBeenCalled();
    terminarLogout();
    await intento;
    expect(iniciarSesion).toHaveBeenCalledWith("google", { redirectTo: "/" }, undefined);
  });

  it("inicia OAuth después del cierre correcto de sesión", async () => {
    cerrarSesion.mockClear();
    iniciarSesion.mockClear();
    await iniciarGoogleConSesionLimpia(cerrarSesion, iniciarSesion);
    expect(order).toEqual(["logout:false", "login:google:/:"]);
  });

  it("conserva el hint de una cuenta Google recordada", async () => {
    await iniciarGoogleConSesionLimpia(cerrarSesion, iniciarSesion, " docente@flacso.edu.uy ");
    expect(order).toEqual(["logout:false", "login:google:/:docente@flacso.edu.uy"]);
  });

  it("no intenta Google si el cierre de sesión falla", async () => {
    iniciarSesion.mockClear();
    await expect(iniciarGoogleConSesionLimpia(async () => {
      throw new Error("No se pudo cerrar sesión");
    }, iniciarSesion)).rejects.toThrow("No se pudo cerrar sesión");
    expect(iniciarSesion).not.toHaveBeenCalled();
  });
});
