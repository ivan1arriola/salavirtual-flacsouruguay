import { describe, expect, it } from "vitest";
import { derivarEstadoGrabacionZoomFicha as f } from "../src/modules/reuniones/estado-grabacion-zoom.domain";

describe("estado de grabación Zoom", () => {
  it("distingue no prevista, sin confirmar, procesando, sincronizando y disponible", () => {
    expect(f({ requiereGrabacion: false, ocurrencias: [] })).toBe("NO_PREVISTA");
    expect(f({ requiereGrabacion: true, ocurrencias: [] })).toBe("SIN_CONFIRMAR");
    expect(f({ requiereGrabacion: true, ocurrencias: [{ pendiente: true, archivos: [] }] })).toBe("PROCESANDO");
    expect(f({ requiereGrabacion: true, ocurrencias: [{ pendiente: false, archivos: [{ url: null }] }] })).toBe(
      "SINCRONIZANDO"
    );
    expect(f({ requiereGrabacion: false, ocurrencias: [{ pendiente: false, archivos: [{ url: "x" }] }] })).toBe(
      "DISPONIBLE"
    );
  });
});
