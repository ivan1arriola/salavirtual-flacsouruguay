import { describe, expect, it, vi } from "vitest";
import { obtenerTarifaVigente } from "../src/modules/asistencia/tarifas.adapter";

describe("tarifa vigente de asistencia", () => {
  it("elige la ultima tarifa creada para la modalidad", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "rate-2", valorHora: 450, moneda: "UYU" });
    const rate = await obtenerTarifaVigente(
      {
        tarifaAsistenciaTecnica: { findFirst }
      } as never,
      "VIRTUAL"
    );

    expect(rate.id).toBe("rate-2");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modalidad: "VIRTUAL" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    );
  });

  it("impide asignar si la modalidad todavia no tiene tarifa", async () => {
    await expect(
      obtenerTarifaVigente(
        {
          tarifaAsistenciaTecnica: { findFirst: vi.fn().mockResolvedValue(null) }
        } as never,
        "HIBRIDA"
      )
    ).rejects.toThrow("No hay una tarifa configurada");
  });
});
