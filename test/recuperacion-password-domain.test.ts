import { describe, expect, it } from "vitest";
import {
  hashTokenRecuperacion,
  identifierRecuperacionPassword,
  restablecerPasswordSchema,
  solicitudRecuperacionPasswordSchema,
  tokenRecuperacionVigente,
  usuarioIdDesdeIdentifierRecuperacion
} from "../src/modules/usuarios/recuperacion-password.domain";

describe("recuperación de contraseña", () => {
  it("normaliza el correo de la solicitud", () => {
    expect(solicitudRecuperacionPasswordSchema.parse({ email: " Usuario@FLACSO.EDU.UY " })).toEqual({
      email: "usuario@flacso.edu.uy"
    });
  });

  it("guarda un hash del token y no el token original", () => {
    const token = "token-de-prueba-con-suficiente-entropia-1234567890";
    const hashed = hashTokenRecuperacion(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toBe(token);
    expect(hashTokenRecuperacion(token)).toBe(hashed);
  });

  it("separa los tokens de recuperación con un namespace propio", () => {
    const identifier = identifierRecuperacionPassword("ivan");
    expect(identifier).toBe("password-reset:ivan");
    expect(usuarioIdDesdeIdentifierRecuperacion(identifier)).toBe("ivan");
    expect(usuarioIdDesdeIdentifierRecuperacion("otro:ivan")).toBeNull();
  });

  it("considera vigente solo un token que todavía no venció", () => {
    const ahora = new Date("2026-08-14T23:00:00-03:00");
    expect(tokenRecuperacionVigente({ expires: new Date(ahora.getTime() + 1) }, ahora)).toBe(true);
    expect(tokenRecuperacionVigente({ expires: ahora }, ahora)).toBe(false);
  });

  it("exige contraseña de al menos 8 caracteres y confirmación coincidente", () => {
    expect(
      restablecerPasswordSchema.safeParse({
        token: "a".repeat(43),
        passwordNueva: "segura123",
        confirmarPassword: "segura123"
      }).success
    ).toBe(true);

    expect(
      restablecerPasswordSchema.safeParse({
        token: "a".repeat(43),
        passwordNueva: "segura123",
        confirmarPassword: "distinta123"
      }).success
    ).toBe(false);
  });
});
