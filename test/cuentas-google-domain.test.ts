import { describe, expect, it } from "vitest";
import {
  puedeGestionarCuentasGoogle,
  reemplazarCuentasGoogleSchema,
  resolverEmailPrincipal,
  tieneMetodoDeAcceso
} from "../src/modules/usuarios/cuentas-google.domain";

describe("cuentas Google permitidas", () => {
  it("solo pueden ser gestionadas por Administracion", () => {
    expect(
      puedeGestionarCuentasGoogle({
        id: "admin",
        rol: "ADMINISTRACION",
        activo: true
      })
    ).toBe(true);
    expect(
      puedeGestionarCuentasGoogle({
        id: "docente",
        rol: "DOCENTE",
        activo: true
      })
    ).toBe(false);
  });

  it("normaliza cuentas Google y elimina duplicados", () => {
    expect(
      reemplazarCuentasGoogleSchema.parse({
        emails: ["DOCENTE@FLACSO.EDU.UY", "docente@flacso.edu.uy"]
      }).emails
    ).toEqual(["docente@flacso.edu.uy"]);
    expect(reemplazarCuentasGoogleSchema.parse({ emails: ["persona@gmail.com"] }).emails).toEqual([
      "persona@gmail.com"
    ]);
  });

  it("normaliza el correo principal editable", () => {
    expect(
      reemplazarCuentasGoogleSchema.parse({
        emails: [],
        emailPrincipal: " Persona@Ejemplo.COM "
      }).emailPrincipal
    ).toBe("persona@ejemplo.com");
  });

  it("usa una cuenta Google como correo principal cuando existe", () => {
    expect(
      resolverEmailPrincipal({
        emailsGoogle: ["google@flacso.edu.uy"],
        emailPrincipalActual: "otro@ejemplo.com",
        emailPrincipalSolicitado: "manual@ejemplo.com"
      })
    ).toBe("google@flacso.edu.uy");
  });

  it("conserva como principal la cuenta Google que ya era principal", () => {
    expect(
      resolverEmailPrincipal({
        emailsGoogle: ["secundaria@gmail.com", "principal@flacso.edu.uy"],
        emailPrincipalActual: "PRINCIPAL@FLACSO.EDU.UY"
      })
    ).toBe("principal@flacso.edu.uy");
  });

  it("permite editar el correo principal si no hay cuenta Google", () => {
    expect(
      resolverEmailPrincipal({
        emailsGoogle: [],
        emailPrincipalActual: "anterior@ejemplo.com",
        emailPrincipalSolicitado: "nuevo@ejemplo.com"
      })
    ).toBe("nuevo@ejemplo.com");
  });

  it("exige al menos Google o password como metodo de acceso", () => {
    expect(tieneMetodoDeAcceso({ tienePassword: false, cantidadCuentasGoogle: 1 })).toBe(true);
    expect(tieneMetodoDeAcceso({ tienePassword: true, cantidadCuentasGoogle: 0 })).toBe(true);
    expect(tieneMetodoDeAcceso({ tienePassword: false, cantidadCuentasGoogle: 0 })).toBe(false);
  });
});
