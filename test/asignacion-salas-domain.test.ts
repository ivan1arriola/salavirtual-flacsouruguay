import { describe, expect, it } from "vitest";
import { asignarSalas } from "../src/modules/reuniones/asignacion-salas.domain";

const date = (hour: number) => new Date(`2026-08-01T${String(hour).padStart(2, "0")}:00:00Z`);

describe("asignacion funcional de salas Meet", () => {
  it("evita solapar reuniones en una misma sala", () => {
    const result = asignarSalas(
      [
        { id: "a", serieId: "serie-a", inicio: date(10), fin: date(12) },
        { id: "b", serieId: "serie-b", inicio: date(11), fin: date(13) },
      ],
      [
        { id: "sala-1", prioridad: 1 },
        { id: "sala-2", prioridad: 2 },
      ],
    );

    expect(result).toEqual({
      ok: true,
      asignaciones: [
        { reunionId: "a", salaId: "sala-1" },
        { reunionId: "b", salaId: "sala-2" },
      ],
    });
  });

  it("mantiene la sala de una serie cuando vuelve a estar disponible", () => {
    const result = asignarSalas(
      [
        { id: "a1", serieId: "serie-a", inicio: date(10), fin: date(11) },
        { id: "b", serieId: "serie-b", inicio: date(10), fin: date(12) },
        { id: "a2", serieId: "serie-a", inicio: date(13), fin: date(14) },
      ],
      [
        { id: "sala-1", prioridad: 1 },
        { id: "sala-2", prioridad: 2 },
      ],
    );

    expect(result.ok && result.asignaciones[2]).toEqual({
      reunionId: "a2",
      salaId: "sala-1",
    });
  });

  it("informa reuniones que exceden la capacidad simultanea", () => {
    expect(
      asignarSalas(
        [
          { id: "a", serieId: "a", inicio: date(10), fin: date(12) },
          { id: "b", serieId: "b", inicio: date(11), fin: date(13) },
        ],
        [{ id: "sala-1", prioridad: 1 }],
      ),
    ).toEqual({ ok: false, reunionIdsSinSala: ["b"] });
  });
});
