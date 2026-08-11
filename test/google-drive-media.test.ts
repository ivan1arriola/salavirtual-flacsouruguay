import { describe, expect, it } from "vitest";
import { extraerAccessToken } from "../src/modules/meet/google-drive-media.adapter";

describe("streaming de archivos de Google Drive", () => {
  it("extrae el token de la respuesta actual de google-auth-library", () => {
    expect(extraerAccessToken({ token: "access-token", res: null })).toBe("access-token");
  });

  it("mantiene compatibilidad con respuestas de token directas", () => {
    expect(extraerAccessToken("access-token")).toBe("access-token");
  });

  it("rechaza respuestas sin token", () => {
    expect(() => extraerAccessToken({ token: null })).toThrow("Google no devolvió un token");
  });
});
