import { describe, expect, it, vi } from "vitest";
import { listarInventarioZoomUseCase } from "../src/modules/archivos/application";
import type { ZoomInventarioLecturaPort } from "../src/modules/archivos/ports";

const pagina = { ocurrencias: [], pagina: 1, totalPaginas: 1, totalOcurrencias: 0 };
const repo = () =>
  ({ listarInventario: vi.fn(async () => pagina) }) satisfies ZoomInventarioLecturaPort;

describe("listarInventarioZoomUseCase: alcance verificado en el servidor", () => {
  it("docente y asistente técnico reciben PROHIBIDO y el repositorio ni se consulta", async () => {
    for (const rol of ["DOCENTE", "ASISTENTE_TECNICO"] as const) {
      const r = repo();
      expect(
        await listarInventarioZoomUseCase(r, { id: "u", rol }, { pagina: 1, vinculo: "TODAS" }),
      ).toEqual({ tipo: "PROHIBIDO" });
      expect(r.listarInventario).not.toHaveBeenCalled();
    }
  });

  it("administración lista, incluidas las ocurrencias sin vínculo", async () => {
    const r = repo();
    const res = await listarInventarioZoomUseCase(
      r,
      { id: "u", rol: "ADMINISTRACION" },
      { pagina: 2, vinculo: "SIN_VINCULO" },
    );
    expect(res).toEqual({ tipo: "OK", pagina });
    expect(r.listarInventario).toHaveBeenCalledWith({ pagina: 2, vinculo: "SIN_VINCULO" });
  });

  it("normaliza página inválida a 1", async () => {
    const r = repo();
    await listarInventarioZoomUseCase(
      r,
      { id: "u", rol: "ADMINISTRACION" },
      { pagina: -3, vinculo: "TODAS" },
    );
    expect(r.listarInventario).toHaveBeenCalledWith({ pagina: 1, vinculo: "TODAS" });
  });
});
