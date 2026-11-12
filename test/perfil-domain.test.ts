import { describe, expect, it } from "vitest";
import { cambioPasswordSchema, perfilPersonalSchema } from "../src/modules/usuarios/perfil.domain";

describe("perfil personal", () => {
  it("normaliza campos opcionales sin alterar la identidad de acceso", () => {
    expect(
      perfilPersonalSchema.parse({
        nombres: "  Ana ",
        apellidos: " ",
        telefono: " 099 123 456 ",
        imagenUrl: ""
      })
    ).toEqual({ nombres: "Ana", apellidos: null, telefono: "099 123 456", imagenUrl: null });
  });

  it("rechaza contraseñas cortas o confirmaciones diferentes", () => {
    expect(
      cambioPasswordSchema.safeParse({ passwordNueva: "corta", confirmarPassword: "corta" }).success
    ).toBe(false);
    expect(
      cambioPasswordSchema.safeParse({ passwordNueva: "password-segura", confirmarPassword: "otra-password" })
        .success
    ).toBe(false);
    expect(
      cambioPasswordSchema.safeParse({
        passwordActual: "anterior",
        passwordNueva: "password-segura",
        confirmarPassword: "password-segura"
      }).success
    ).toBe(true);
  });
});
