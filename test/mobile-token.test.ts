import { describe, expect, it } from "vitest";
import { signMobileToken, verifyMobileToken } from "../src/lib/auth/mobile-token";

const SECRET = "test-secret-with-more-than-thirty-two-characters";

describe("mobile token", () => {
  it("firma y valida un token vigente de asistente por defecto", () => {
    const issued = signMobileToken("usuario-1", SECRET, 1_000, 600);
    const payload = verifyMobileToken(issued.accessToken, SECRET, 1_200);

    expect(payload).toMatchObject({
      sub: "usuario-1",
      role: "ASISTENTE_TECNICO",
      iat: 1_000,
      exp: 1_600,
      v: 1,
    });
    expect(issued.expiresAt).toBe(new Date(1_600_000).toISOString());
  });

  it("firma y valida un token vigente de administración", () => {
    const issued = signMobileToken("usuario-1", SECRET, 1_000, 600, "ADMINISTRACION");

    expect(verifyMobileToken(issued.accessToken, SECRET, 1_200)).toMatchObject({
      sub: "usuario-1",
      role: "ADMINISTRACION",
    });
  });

  it("rechaza tokens vencidos", () => {
    const issued = signMobileToken("usuario-1", SECRET, 1_000, 10);
    expect(verifyMobileToken(issued.accessToken, SECRET, 1_010)).toBeNull();
  });

  it("rechaza tokens manipulados", () => {
    const issued = signMobileToken("usuario-1", SECRET, 1_000, 600);
    const [payload, signature] = issued.accessToken.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "otro", role: "ASISTENTE_TECNICO", iat: 1_000, exp: 1_600, v: 1 }),
      "utf8",
    ).toString("base64url");

    expect(verifyMobileToken(`${tamperedPayload}.${signature}`, SECRET, 1_200)).toBeNull();
    expect(payload).not.toBe(tamperedPayload);
  });
});
