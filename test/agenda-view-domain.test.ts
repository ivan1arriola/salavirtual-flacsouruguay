import { describe, expect, it } from "vitest";
import {
  agruparEncuentrosPorSerie,
  calcularInfoPaginacion,
  normalizarCodigoReunionBuscado,
  parsearFechaFiltro,
  resolverPaginacionAgenda,
  resolverPeriodoAgenda,
  resolverVistaAgenda,
} from "../src/modules/reuniones/agenda-view.domain";

function meeting(id: string, requestId: string, createdAt: string, title = "Diploma") {
  const inicioProgramadoAt = new Date(createdAt);
  return {
    id,
    inicioProgramadoAt,
    finProgramadoAt: new Date(inicioProgramadoAt.getTime() + 60 * 60 * 1000),
    solicitud: {
      id: requestId,
      docenteProgramaId: "docente-programa-1",
      titulo: title,
      createdAt: new Date(createdAt),
    },
  };
}

describe("período de la agenda", () => {
  it("acepta anteriores y cualquier otro valor es próximas", () => {
    expect(resolverPeriodoAgenda("anteriores")).toBe("anteriores");
    expect(resolverPeriodoAgenda("proximas")).toBe("proximas");
    expect(resolverPeriodoAgenda(undefined)).toBe("proximas");
    expect(resolverPeriodoAgenda("cualquiera")).toBe("proximas");
  });
});

describe("vista de agenda", () => {
  it("usa series como vista predeterminada", () => {
    expect(resolverVistaAgenda()).toBe("series");
    expect(resolverVistaAgenda("desconocida")).toBe("series");
    expect(resolverVistaAgenda("encuentros")).toBe("encuentros");
  });

  it("recompone una serie migrada aunque tenga varias solicitudes", () => {
    const meetings = [
      meeting("i1", "s1", "2026-04-08T00:12:12.813Z"),
      meeting("i2", "s2", "2026-04-08T00:12:12.813Z"),
      meeting("i3", "s3", "2026-08-06T19:22:03.643Z"),
    ];

    expect(agruparEncuentrosPorSerie(meetings).map((group) => group.map(({ id }) => id))).toEqual([
      ["i1", "i2"],
      ["i3"],
    ]);
  });

  it("ordena las series históricas desde la más reciente", () => {
    const meetings = [
      meeting("i1", "s1", "2026-04-08T00:12:12.813Z"),
      meeting("i2", "s2", "2026-08-06T19:22:03.643Z"),
      meeting("i3", "s3", "2026-06-01T12:00:00.000Z"),
    ];

    expect(agruparEncuentrosPorSerie(meetings, true).map((group) => group[0].id)).toEqual([
      "i2",
      "i3",
      "i1",
    ]);
  });

  it("no agrupa títulos diferentes", () => {
    const meetings = [
      meeting("i1", "s1", "2026-08-06T19:22:03.643Z", "Diploma A"),
      meeting("i2", "s2", "2026-08-06T19:22:03.643Z", "Diploma B"),
    ];

    expect(agruparEncuentrosPorSerie(meetings)).toHaveLength(2);
  });

  it("acepta un código o un enlace completo de Google Meet", () => {
    expect(normalizarCodigoReunionBuscado(" ABC-DEFG-HIJ ")).toBe("abc-defg-hij");
    expect(normalizarCodigoReunionBuscado("https://meet.google.com/abc-defg-hij?authuser=1")).toBe(
      "abc-defg-hij",
    );
  });

  it("resuelve la paginación con valores seguros", () => {
    expect(resolverPaginacionAgenda(undefined)).toEqual({ page: 1, pageSize: 50, skip: 0 });
    expect(resolverPaginacionAgenda("3", 50)).toEqual({ page: 3, pageSize: 50, skip: 100 });
    expect(resolverPaginacionAgenda("-5", 50)).toEqual({ page: 1, pageSize: 50, skip: 0 });
    expect(resolverPaginacionAgenda("invalid", 50)).toEqual({ page: 1, pageSize: 50, skip: 0 });
  });

  it("calcula rangos de paginación correctamente", () => {
    const firstPage = calcularInfoPaginacion(120, 1, 50);
    expect(firstPage).toEqual({
      paginaActual: 1,
      totalPaginas: 3,
      tamanoPagina: 50,
      totalElementos: 120,
      desdeElemento: 1,
      hastaElemento: 50,
      tieneAnterior: false,
      tieneSiguiente: true,
    });

    const lastPage = calcularInfoPaginacion(120, 3, 50);
    expect(lastPage).toEqual({
      paginaActual: 3,
      totalPaginas: 3,
      tamanoPagina: 50,
      totalElementos: 120,
      desdeElemento: 101,
      hastaElemento: 120,
      tieneAnterior: true,
      tieneSiguiente: false,
    });

    const empty = calcularInfoPaginacion(0, 1, 50);
    expect(empty).toEqual({
      paginaActual: 1,
      totalPaginas: 1,
      tamanoPagina: 50,
      totalElementos: 0,
      desdeElemento: 0,
      hastaElemento: 0,
      tieneAnterior: false,
      tieneSiguiente: false,
    });
  });

  it("parsea fechas de filtro con zona horaria de Montevideo", () => {
    expect(parsearFechaFiltro("2026-09-10")).toBe("2026-09-10T00:00:00.000-03:00");
    expect(parsearFechaFiltro("2026-09-10", true)).toBe("2026-09-10T23:59:59.999-03:00");
    expect(parsearFechaFiltro("invalido")).toBeUndefined();
    expect(parsearFechaFiltro(undefined)).toBeUndefined();
  });
});
