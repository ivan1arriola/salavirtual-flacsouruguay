import { describe, expect, it } from "vitest";
import {
  derivarEstadoGrabacionZoomFicha as f,
  estadoArchivoGrabacionZoom as e,
} from "../src/modules/reuniones/estado-grabacion-zoom.domain";

describe("estado de grabación Zoom", () => {
  it("distingue no prevista, sin confirmar, procesando, sincronizando y disponible", () => {
    expect(f({ requiereGrabacion: false, ocurrencias: [] })).toBe("NO_PREVISTA");
    expect(f({ requiereGrabacion: true, ocurrencias: [] })).toBe("SIN_CONFIRMAR");
    expect(f({ requiereGrabacion: true, ocurrencias: [{ pendiente: true, archivos: [] }] })).toBe(
      "PROCESANDO",
    );
    expect(
      f({
        requiereGrabacion: true,
        ocurrencias: [{ pendiente: false, archivos: [{ url: null }] }],
      }),
    ).toBe("SINCRONIZANDO");
    expect(
      f({
        requiereGrabacion: false,
        ocurrencias: [{ pendiente: false, archivos: [{ url: "x" }] }],
      }),
    ).toBe("DISPONIBLE");
  });

  it("traduce el estado de cada archivo y marca la atención requerida", () => {
    expect(
      [
        "DESCUBIERTO",
        "PROCESANDO_ORIGEN",
        "PENDIENTE",
        "COPIANDO",
        "CONSERVADO",
        "ERROR_REINTENTABLE",
        "REQUIERE_REVISION",
        "X",
      ].map(e),
    ).toEqual([
      "DISPONIBLE_ZOOM",
      "PROCESANDO_ZOOM",
      "PENDIENTE",
      "SINCRONIZANDO",
      "DISPONIBLE_DRIVE",
      "ERROR_REINTENTABLE",
      "REQUIERE_REVISION",
      "PENDIENTE",
    ]);
    expect(
      f({
        requiereGrabacion: true,
        ocurrencias: [{ pendiente: false, archivos: [{ url: null, estado: "REQUIERE_REVISION" }] }],
      }),
    ).toBe("REQUIERE_ATENCION");
  });
});
