import { describe, expect, it } from "vitest";
import {
  normalizarCorreosCopiaReporte,
  puedeConfigurarAsistenciaTecnica
} from "@/src/modules/configuracion/asistencia-tecnica.domain";

describe("configuración de reportes de asistencia técnica", () => {
  it("normaliza, valida y elimina correos repetidos", () => {
    expect(normalizarCorreosCopiaReporte("ADMIN@FLACSO.EDU.UY\notro@flacso.edu.uy, admin@flacso.edu.uy")).toEqual([
      "admin@flacso.edu.uy",
      "otro@flacso.edu.uy"
    ]);
  });

  it("rechaza correos inválidos", () => {
    expect(() => normalizarCorreosCopiaReporte("no-es-un-correo")).toThrow();
  });

  it("solo permite configurar a Administración activa", () => {
    expect(puedeConfigurarAsistenciaTecnica({ id: "1", rol: "ADMINISTRACION", activo: true })).toBe(true);
    expect(puedeConfigurarAsistenciaTecnica({ id: "2", rol: "ADMINISTRACION", activo: false })).toBe(false);
    expect(puedeConfigurarAsistenciaTecnica({ id: "3", rol: "ASISTENTE_TECNICO", activo: true })).toBe(false);
  });
});
