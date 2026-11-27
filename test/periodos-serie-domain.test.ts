import { describe, expect, it } from "vitest";
import { pertenecenAlMismoDia } from "../src/modules/reuniones/periodos.domain";
import {
  claveSerieReunion,
  construirFiltroSerieSolicitud,
} from "../src/modules/reuniones/serie-reunion.domain";

describe("periodos de reuniones", () => {
  it("usa la zona horaria indicada y no el día UTC", () => {
    expect(
      pertenecenAlMismoDia(
        new Date("2026-08-20T23:30:00Z"),
        new Date("2026-08-21T00:30:00Z"),
        "America/Montevideo",
      ),
    ).toBe(true);
  });

  it("detecta cuando un encuentro cruza la medianoche de Montevideo", () => {
    expect(
      pertenecenAlMismoDia(
        new Date("2026-08-20T02:30:00Z"),
        new Date("2026-08-20T03:30:00Z"),
        "America/Montevideo",
      ),
    ).toBe(false);
  });
});

describe("clave de serie de reunión", () => {
  const createdAt = new Date("2026-08-18T20:00:00Z");

  it("es estable para los mismos datos", () => {
    const request = {
      docenteProgramaId: "dp-1",
      titulo: "Clase semanal",
      createdAt,
    };
    expect(claveSerieReunion(request)).toBe(claveSerieReunion({ ...request }));
  });

  it("prioriza serieReunionId canónico cuando está presente", () => {
    const request = {
      serieReunionId: "serie-abc-123",
      docenteProgramaId: "dp-1",
      titulo: "Clase semanal",
      createdAt,
    };
    expect(claveSerieReunion(request)).toBe("serie:serie-abc-123");
    expect(
      claveSerieReunion({
        serieReunionId: "serie-abc-123",
        docenteProgramaId: "dp-distinto",
        titulo: "Otro título",
        createdAt: new Date("2026-10-10T10:00:00Z"),
      }),
    ).toBe("serie:serie-abc-123");
  });

  it("distingue docente-programa, título y momento de creación", () => {
    const base = claveSerieReunion({
      docenteProgramaId: "dp-1",
      titulo: "Clase semanal",
      createdAt,
    });

    expect(
      claveSerieReunion({ docenteProgramaId: "dp-2", titulo: "Clase semanal", createdAt }),
    ).not.toBe(base);
    expect(
      claveSerieReunion({ docenteProgramaId: "dp-1", titulo: "Otra clase", createdAt }),
    ).not.toBe(base);
    expect(
      claveSerieReunion({
        docenteProgramaId: "dp-1",
        titulo: "Clase semanal",
        createdAt: new Date("2026-08-18T20:00:01Z"),
      }),
    ).not.toBe(base);
  });
});

describe("construirFiltroSerieSolicitud", () => {
  const createdAt = new Date("2026-08-18T20:00:00Z");

  it("devuelve filtro por serieReunionId si está definido", () => {
    const filter = construirFiltroSerieSolicitud({
      serieReunionId: "serie-xyz",
      docenteProgramaId: "dp-1",
      titulo: "Seminario",
      createdAt,
    });
    expect(filter).toEqual({ serieReunionId: "serie-xyz" });
  });

  it("devuelve filtro compuesto histórico si serieReunionId es nulo o indefinido", () => {
    const filter = construirFiltroSerieSolicitud({
      serieReunionId: null,
      docenteProgramaId: "dp-1",
      titulo: "Seminario",
      createdAt,
    });
    expect(filter).toEqual({
      docenteProgramaId: "dp-1",
      titulo: "Seminario",
      createdAt,
    });
  });
});
