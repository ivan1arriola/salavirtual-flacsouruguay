import { describe, expect, it } from "vitest";
import {
  parseAuthConfig,
  resolverRedireccionAutorizada
} from "../src/modules/usuarios/auth-config.domain";

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
      baseUrl: "http://localhost:3000",
      google: null
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

  it("acepta OAuth Google solamente con ambas credenciales", () => {
    expect(
      parseAuthConfig({
        ...validEnvironment,
        AUTH_GOOGLE_ID: "client-id",
        AUTH_GOOGLE_SECRET: "client-secret"
      }).google
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret"
    });

    expect(() =>
      parseAuthConfig({
        ...validEnvironment,
        AUTH_GOOGLE_ID: "client-id"
      })
    ).toThrow();
  });
});

describe("redirecciones de autenticacion", () => {
  it("permite rutas del origen configurado", () => {
    expect(resolverRedireccionAutorizada("/agenda", validEnvironment.APP_BASE_URL)).toBe(
      "http://localhost:3000/agenda"
    );
  });

  it("rechaza redirecciones a origenes externos", () => {
    expect(
      resolverRedireccionAutorizada(
        "https://sitio-externo.example/phishing",
        validEnvironment.APP_BASE_URL
      )
    ).toBe("http://localhost:3000/");
  });
});
