import { describe, expect, it } from "vitest";
import {
  mapearEstadoAsignacionLegacy,
  mapearEstadoInstanciaLegacy,
  mapearEstadoSolicitudLegacy,
  mapearTipoInstanciasLegacy,
  normalizarNombrePrograma
} from "../src/modules/migracion/reuniones-legacy.domain";

describe("mapeo funcional de reuniones Zoom", () => {
  it("normaliza programas sin cambiar su identidad", () => {
    expect(normalizarNombrePrograma("  Diploma   Docente ")).toBe("Diploma Docente");
  });

  it("consolida estados anteriores en el dominio nuevo", () => {
    expect(mapearEstadoSolicitudLegacy("CANCELADA_DOCENTE")).toBe("CANCELADA");
    expect(mapearEstadoInstanciaLegacy("FINALIZADO")).toBe("FINALIZADA");
    expect(mapearEstadoAsignacionLegacy("REASIGNADO")).toBe("CANCELADO");
    expect(mapearTipoInstanciasLegacy("MULTIPLE_COMPATIBLE_ZOOM")).toBe("MULTIPLE");
  });
});
