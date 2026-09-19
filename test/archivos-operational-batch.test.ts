import { describe, expect, it, vi } from "vitest";
import {
  seleccionarEventosOperativosUseCase,
  type EventosOperativosRepositoryPort
} from "@/src/modules/archivos/application";

describe("archivos: lote operativo", () => {
  it("prioriza las tres ventanas, limita el lote y no repite eventos", async () => {
    const listar = vi.fn()
      .mockResolvedValueOnce(["hot-1", "shared"])
      .mockResolvedValueOnce(["shared", "middle-1"])
      .mockResolvedValueOnce(["closing-1"]);
    const repository: EventosOperativosRepositoryPort = { listarEventosOperativos: listar };

    const ids = await seleccionarEventosOperativosUseCase(
      repository,
      new Date("2026-09-19T12:00:00.000Z"),
      4
    );

    expect(ids).toEqual(["hot-1", "shared", "middle-1", "closing-1"]);
    expect(listar).toHaveBeenCalledTimes(3);
    expect(listar.mock.calls.map(([input]) => input.limite)).toEqual([4, 2, 1]);
  });
});
