import { describe, expect, it } from "vitest";
import {
  puedeGestionarCuentasGoogle,
  reemplazarCuentasGoogleSchema,
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

  it("normaliza, limita al dominio FLACSO y elimina duplicados", () => {
    expect(
      reemplazarCuentasGoogleSchema.parse({
        emails: ["DOCENTE@FLACSO.EDU.UY", "docente@flacso.edu.uy"]
      }).emails
    ).toEqual(["docente@flacso.edu.uy"]);
    expect(() =>
      reemplazarCuentasGoogleSchema.parse({ emails: ["persona@gmail.com"] })
    ).toThrow();
  });

  it("exige al menos Google o password como metodo de acceso", () => {
    expect(tieneMetodoDeAcceso({ tienePassword: false, cantidadCuentasGoogle: 1 })).toBe(
      true
    );
    expect(tieneMetodoDeAcceso({ tienePassword: true, cantidadCuentasGoogle: 0 })).toBe(
      true
    );
    expect(tieneMetodoDeAcceso({ tienePassword: false, cantidadCuentasGoogle: 0 })).toBe(
      false
    );
  });
});
