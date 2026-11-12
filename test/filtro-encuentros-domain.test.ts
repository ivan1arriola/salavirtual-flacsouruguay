import { describe, expect, it } from "vitest";
import { filtrarEncuentrosPorVista } from "../src/modules/reuniones/filtro-encuentros.domain";

const encuentros = [
  { id: "pasado-anterior", temporalidad: "PASADO" as const, esDeHoy: false },
  { id: "pasado-hoy", temporalidad: "PASADO" as const, esDeHoy: true },
  { id: "en-curso", temporalidad: "EN_CURSO" as const, esDeHoy: true },
  { id: "futuro", temporalidad: "FUTURO" as const, esDeHoy: false }
];

describe("filtrarEncuentrosPorVista", () => {
  it("muestra todos los encuentros al seleccionar Todos", () => {
    expect(filtrarEncuentrosPorVista(encuentros, "TODOS").map(({ id }) => id)).toEqual([
      "pasado-anterior",
      "pasado-hoy",
      "en-curso",
      "futuro"
    ]);
  });

  it("muestra por defecto los encuentros de hoy y futuros", () => {
    expect(filtrarEncuentrosPorVista(encuentros, "PROXIMOS").map(({ id }) => id)).toEqual([
      "pasado-hoy",
      "en-curso",
      "futuro"
    ]);
  });

  it("reserva la vista de pasados para encuentros anteriores a hoy", () => {
    expect(filtrarEncuentrosPorVista(encuentros, "PASADOS").map(({ id }) => id)).toEqual(["pasado-anterior"]);
  });
});
