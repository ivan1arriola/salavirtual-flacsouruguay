import { describe, expect, it } from "vitest";
import { pertenecenAlMismoDia } from "../src/modules/reuniones/periodos.domain";
import { claveSerieReunion } from "../src/modules/reuniones/serie-reunion.domain";

describe("periodos de reuniones", () => {
  it("usa la zona horaria indicada y no el día UTC", () => {
    expect(pertenecenAlMismoDia(
      new Date("2026-08-20T23:30:00Z"),
      new Date("2026-08-21T00:30:00Z"),
      "America/Montevideo"
    )).toBe(true);
  });

  it("detecta cuando un encuentro cruza la medianoche de Montevideo", () => {
    expect(pertenecenAlMismoDia(
      new Date("2026-08-20T02:30:00Z"),
      new Date("2026-08-20T03:30:00Z"),
      "America/Montevideo"
    )).toBe(false);
  });
});

describe("clave de serie de reunión", () => {
  const createdAt = new Date("2026-08-18T20:00:00Z");

  it("es estable para los mismos datos", () => {
    const request = {
      docenteProgramaId: "dp-1",
      titulo: "Clase semanal",
      createdAt
    };
    expect(claveSerieReunion(request)).toBe(claveSerieReunion({ ...request }));
  });

  it("distingue docente-programa, título y momento de creación", () => {
    const base = claveSerieReunion({
      docenteProgramaId: "dp-1",
      titulo: "Clase semanal",
      createdAt
    });

    expect(claveSerieReunion({ docenteProgramaId: "dp-2", titulo: "Clase semanal", createdAt })).not.toBe(base);
    expect(claveSerieReunion({ docenteProgramaId: "dp-1", titulo: "Otra clase", createdAt })).not.toBe(base);
    expect(claveSerieReunion({
      docenteProgramaId: "dp-1",
      titulo: "Clase semanal",
      createdAt: new Date("2026-08-18T20:00:01Z")
    })).not.toBe(base);
  });
});
