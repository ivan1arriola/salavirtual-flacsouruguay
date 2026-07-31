import { describe, expect, it } from "vitest";
import { parseAuthConfig } from "../src/modules/usuarios/auth-config.domain";

const validEnvironment = Object.freeze({
  AUTH_SECRET: "a".repeat(64),
  AUTH_TRUST_HOST: "true",
  APP_BASE_URL: "http://localhost:3000"
});

describe("configuracion funcional de autenticacion", () => {
  it("transforma las variables en una configuracion tipada", () => {
    expect(parseAuthConfig(validEnvironment)).toEqual({
      secret: validEnvironment.AUTH_SECRET,
      trustHost: true,
      baseUrl: "http://localhost:3000"
    });
  });

  it("rechaza secretos demasiado cortos", () => {
    expect(() =>
      parseAuthConfig({
        ...validEnvironment,
        AUTH_SECRET: "inseguro"
      })
    ).toThrow();
  });

  it("rechaza valores ambiguos para trustHost", () => {
    expect(() =>
      parseAuthConfig({
        ...validEnvironment,
        AUTH_TRUST_HOST: "si"
      })
    ).toThrow();
  });
});
