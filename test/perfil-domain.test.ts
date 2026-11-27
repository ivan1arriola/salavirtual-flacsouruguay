import { describe, expect, it } from "vitest";
import { tiposNotificacionPerfil } from "../app/(gestion)/mi-perfil/preferencias";
import { cambioPasswordSchema, perfilPersonalSchema } from "../src/modules/usuarios/perfil.domain";

describe("perfil personal", () => {
  it("normaliza campos opcionales sin alterar la identidad de acceso", () => {
    expect(
      perfilPersonalSchema.parse({
        nombres: "  Ana ",
        apellidos: " ",
        telefono: " 099 123 456 ",
        imagenUrl: "",
      }),
    ).toEqual({ nombres: "Ana", apellidos: null, telefono: "099 123 456", imagenUrl: null });
  });

  it("omite la imagen existente del cambio si el formulario solo edita los datos de contacto", () => {
    const datos = perfilPersonalSchema.parse({ nombres: "Ana", apellidos: "", telefono: "" });
    expect(datos).toEqual({ nombres: "Ana", apellidos: null, telefono: null });
    expect(datos).not.toHaveProperty("imagenUrl");
  });

  it("muestra solo los avisos del rol y omite la alerta antigua sin emisor", () => {
    expect(tiposNotificacionPerfil("DOCENTE")).not.toContain("ASISTENCIA_REQUERIDA");
    expect(tiposNotificacionPerfil("ASISTENTE_TECNICO")).toContain("ASISTENCIA_REQUERIDA");
    expect(tiposNotificacionPerfil("ASISTENTE_TECNICO")).not.toContain("ASISTENCIA_POSTULACION");
    expect(tiposNotificacionPerfil("ADMINISTRACION")).toContain("ASISTENCIA_POSTULACION");
    expect(tiposNotificacionPerfil("ADMINISTRACION")).not.toContain("HOST_NO_CONECTADO");
  });

  it("rechaza contraseñas cortas o confirmaciones diferentes", () => {
    expect(
      cambioPasswordSchema.safeParse({ passwordNueva: "corta", confirmarPassword: "corta" })
        .success,
    ).toBe(false);
    expect(
      cambioPasswordSchema.safeParse({
        passwordNueva: "password-segura",
        confirmarPassword: "otra-password",
      }).success,
    ).toBe(false);
    expect(
      cambioPasswordSchema.safeParse({
        passwordActual: "anterior",
        passwordNueva: "password-segura",
        confirmarPassword: "password-segura",
      }).success,
    ).toBe(true);
  });
});
