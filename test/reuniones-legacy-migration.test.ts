import { describe, expect, it } from "vitest";
import {
  mapearEstadoAsignacionLegacy,
  mapearEstadoInstanciaLegacy,
  mapearEstadoSolicitudLegacy,
  mapearTipoInstanciasLegacy,
  normalizarNombrePrograma,
} from "../src/modules/migracion/reuniones-legacy.domain";

describe("mapeo funcional de reuniones Zoom", () => {
  it("normaliza programas sin cambiar su identidad", () => {
    expect(normalizarNombrePrograma("  Diploma   Docente ")).toBe("Diploma Docente");
    expect(normalizarNombrePrograma("Seminario")).toBe("Seminario");
  });

  it.each([
    ["PROVISIONADA", "PROVISIONADA"],
    ["CANCELADA_DOCENTE", "CANCELADA"],
    ["CANCELADA", "CANCELADA"],
    ["PROVISIONANDO", "PROVISIONANDO"],
    ["REGISTRADA", "REQUIERE_REVISION"],
    ["ESTADO_DESCONOCIDO", "REQUIERE_REVISION"],
  ] as const)("mapea solicitud legacy %s a %s", (legacy, expected) => {
    expect(mapearEstadoSolicitudLegacy(legacy)).toBe(expected);
  });

  it.each([
    ["FINALIZADO", "FINALIZADA"],
    ["CANCELADO", "CANCELADA"],
    ["NO_REALIZADO", "NO_REALIZADA"],
    ["PROGRAMADO", "PROGRAMADA"],
    ["DESCONOCIDO", "PROGRAMADA"],
  ] as const)("mapea instancia legacy %s a %s", (legacy, expected) => {
    expect(mapearEstadoInstanciaLegacy(legacy)).toBe(expected);
  });

  it.each([
    ["ACEPTADO", "ACEPTADO"],
    ["RECHAZADO", "RECHAZADO"],
    ["CANCELADO", "CANCELADO"],
    ["REASIGNADO", "CANCELADO"],
    ["ASIGNADO", "ASIGNADO"],
    ["DESCONOCIDO", "ASIGNADO"],
  ] as const)("mapea asignación legacy %s a %s", (legacy, expected) => {
    expect(mapearEstadoAsignacionLegacy(legacy)).toBe(expected);
  });

  it("distingue instancias únicas de cualquier modalidad múltiple anterior", () => {
    expect(mapearTipoInstanciasLegacy("UNICA")).toBe("UNICA");
    expect(mapearTipoInstanciasLegacy("MULTIPLE_COMPATIBLE_ZOOM")).toBe("MULTIPLE");
    expect(mapearTipoInstanciasLegacy("OTRO")).toBe("MULTIPLE");
  });
});
