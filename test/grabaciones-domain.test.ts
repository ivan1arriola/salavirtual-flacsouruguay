import { describe, expect, it } from "vitest";
import {
  obtenerAlcanceGrabaciones,
  puedeSincronizarGrabaciones,
} from "../src/modules/meet/grabaciones.domain";

describe("alcance funcional de grabaciones", () => {
  it("da acceso completo solo a Administracion", () => {
    expect(obtenerAlcanceGrabaciones("ADMINISTRACION")).toBe("COMPLETO");
  });

  it("limita docentes a sus programas", () => {
    expect(obtenerAlcanceGrabaciones("DOCENTE")).toBe("PROGRAMAS_DOCENTE");
  });

  it("limita asistentes a sus asignaciones", () => {
    expect(obtenerAlcanceGrabaciones("ASISTENTE_TECNICO")).toBe("ASIGNACIONES_ASISTENTE");
  });

  it("permite sincronizar a Administracion y docentes", () => {
    expect(puedeSincronizarGrabaciones("ADMINISTRACION")).toBe(true);
    expect(puedeSincronizarGrabaciones("DOCENTE")).toBe(true);
    expect(puedeSincronizarGrabaciones("ASISTENTE_TECNICO")).toBe(false);
  });
});
