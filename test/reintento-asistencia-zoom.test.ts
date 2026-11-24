import { describe, expect, it } from "vitest";
import { debeOfrecerReintentoAsistencia } from "../src/components/zoom-asistencia-vista";

describe("debeOfrecerReintentoAsistencia", () => {
  it("no se ofrece sin ejecuciones de Zoom vinculadas", () => {
    expect(
      debeOfrecerReintentoAsistencia({ ocurrencias: 0, estadoReporte: "NO_DISPONIBLE", registros: 0 })
    ).toBe(false);
  });
  it("se ofrece mientras el reporte no esté disponible", () => {
    expect(
      debeOfrecerReintentoAsistencia({ ocurrencias: 1, estadoReporte: "NO_DISPONIBLE", registros: 0 })
    ).toBe(true);
    expect(debeOfrecerReintentoAsistencia({ ocurrencias: 1, estadoReporte: "ERROR", registros: 0 })).toBe(
      true
    );
  });
  it("se ofrece si el reporte figura disponible pero no hay participantes consolidados (sincronizada antes de vincular)", () => {
    expect(
      debeOfrecerReintentoAsistencia({ ocurrencias: 1, estadoReporte: "DISPONIBLE", registros: 0 })
    ).toBe(true);
  });
  it("no se ofrece cuando el reporte está disponible y consolidado", () => {
    expect(
      debeOfrecerReintentoAsistencia({ ocurrencias: 1, estadoReporte: "DISPONIBLE", registros: 4 })
    ).toBe(false);
  });
});
