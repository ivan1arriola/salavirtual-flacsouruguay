import { describe, expect, it } from "vitest";
import {
  buscarRolAnterior,
  esRolUsuario,
  mapearRolAnterior,
  puedeAdministrar
} from "../src/modules/usuarios/roles";
import { vincularCuentaGoogleSchema } from "../src/modules/usuarios/types";

describe("migracion funcional de roles", () => {
  it.each(["ADMINISTRADOR", "CONTADURIA"])(
    "absorbe %s dentro de ADMINISTRACION",
    (rolAnterior) => {
      expect(buscarRolAnterior(rolAnterior)).toBe("ADMINISTRACION");
    }
  );

  it("unifica los roles anteriores de asistencia", () => {
    expect(buscarRolAnterior("SOPORTE_ZOOM")).toBe("ASISTENTE_TECNICO");
    expect(buscarRolAnterior("ASISTENTE_ZOOM")).toBe("ASISTENTE_TECNICO");
  });

  it("normaliza espacios y mayúsculas y conserva DOCENTE", () => {
    expect(buscarRolAnterior("  administrador ")).toBe("ADMINISTRACION");
    expect(buscarRolAnterior("docente")).toBe("DOCENTE");
    expect(buscarRolAnterior("sin-rol")).toBeNull();
  });

  it("mapea roles anteriores y rechaza valores desconocidos", () => {
    expect(mapearRolAnterior("asistente_zoom")).toBe("ASISTENTE_TECNICO");
    expect(() => mapearRolAnterior("INVITADO")).toThrow("Rol anterior desconocido: INVITADO");
  });

  it("reserva la administracion al rol neutral", () => {
    expect(puedeAdministrar("ADMINISTRACION")).toBe(true);
    expect(puedeAdministrar("DOCENTE")).toBe(false);
    expect(puedeAdministrar("ASISTENTE_TECNICO")).toBe(false);
  });

  it("estrecha valores externos a roles conocidos", () => {
    expect(esRolUsuario("ADMINISTRACION")).toBe(true);
    expect(esRolUsuario("ASISTENTE_TECNICO")).toBe(true);
    expect(esRolUsuario("DOCENTE")).toBe(true);
    expect(esRolUsuario("CONTADURIA")).toBe(false);
    expect(esRolUsuario({ rol: "DOCENTE" })).toBe(false);
    expect(esRolUsuario(null)).toBe(false);
  });
});

describe("cuentas Google FLACSO", () => {
  it("acepta y normaliza una cuenta institucional", () => {
    const resultado = vincularCuentaGoogleSchema.parse({
      usuarioId: "docente.1",
      email: "DOCENTE@FLACSO.EDU.UY",
      providerAccountId: "google-subject",
      dominio: "flacso.edu.uy"
    });

    expect(resultado.email).toBe("docente@flacso.edu.uy");
  });

  it("rechaza cuentas externas", () => {
    expect(() =>
      vincularCuentaGoogleSchema.parse({
        usuarioId: "docente.1",
        email: "docente@gmail.com",
        providerAccountId: "google-subject",
        dominio: "flacso.edu.uy"
      })
    ).toThrow();
  });
});
