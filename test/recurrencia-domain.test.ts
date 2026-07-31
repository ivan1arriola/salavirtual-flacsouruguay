import { describe, expect, it } from "vitest";
import { generarFechasRecurrentes } from "../src/modules/reuniones/recurrencia.domain";

describe("generador de fechas recurrentes", () => {
  it("genera todos los miercoles de un rango con el mismo horario", () => {
    expect(generarFechasRecurrentes({
      desde: "2026-08-01",
      hasta: "2026-08-31",
      diasSemana: [3],
      horaInicio: "10:00",
      horaFin: "14:00"
    })).toEqual([
      { fecha: "2026-08-05", horaInicio: "10:00", horaFin: "14:00" },
      { fecha: "2026-08-12", horaInicio: "10:00", horaFin: "14:00" },
      { fecha: "2026-08-19", horaInicio: "10:00", horaFin: "14:00" },
      { fecha: "2026-08-26", horaInicio: "10:00", horaFin: "14:00" }
    ]);
  });

  it("permite combinar dias y rechaza horarios o rangos invalidos", () => {
    expect(generarFechasRecurrentes({
      desde: "2026-08-03",
      hasta: "2026-08-09",
      diasSemana: [1, 3],
      horaInicio: "10:00",
      horaFin: "14:00"
    }).map(({ fecha }) => fecha)).toEqual(["2026-08-03", "2026-08-05"]);
    expect(() => generarFechasRecurrentes({
      desde: "2026-08-01",
      hasta: "2026-08-31",
      diasSemana: [3],
      horaInicio: "14:00",
      horaFin: "10:00"
    })).toThrow("posterior");
  });
});
