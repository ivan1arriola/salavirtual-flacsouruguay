import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/modules/configuracion/correo.service", () => ({
  enviarCorreoConfigurado: vi.fn()
}));

import {
  crearLiquidacionesRepository,
  crearPlanillaPagosExporter,
  crearTarifasRepository,
  obtenerServicioLiquidaciones
} from "@/src/bootstrap/liquidaciones.server";

describe("liquidaciones bootstrap", () => {
  it("construye repositorios, exportador y servicio sin errores", () => {
    const tarifasRepo = crearTarifasRepository();
    expect(tarifasRepo).toBeDefined();
    expect(typeof tarifasRepo.obtenerTarifaVigente).toBe("function");

    const liquidacionesRepo = crearLiquidacionesRepository();
    expect(liquidacionesRepo).toBeDefined();
    expect(typeof liquidacionesRepo.obtenerFilasPlanillaPagos).toBe("function");

    const exporter = crearPlanillaPagosExporter();
    expect(exporter).toBeDefined();
    expect(typeof exporter.generarPlanillaPagosExcel).toBe("function");

    const servicio = obtenerServicioLiquidaciones();
    expect(servicio).toBeDefined();
    expect(typeof servicio.consultarTarifaVigente).toBe("function");
    expect(typeof servicio.generarPlanillaPagos).toBe("function");
    expect(typeof servicio.consultarResumenAsistentes).toBe("function");
    expect(typeof servicio.enviarReportesMensuales).toBe("function");
  });
});
