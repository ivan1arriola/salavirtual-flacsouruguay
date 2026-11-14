import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoricalMeetingsTable } from "@/src/components/historical-meetings-table";
import { consultarRegistrosZoomImportados } from "@/src/modules/configuracion/registros-zoom-consulta.service";

describe("consulta de registros Zoom importados", () => {
  it("normaliza acentos en la búsqueda parametrizada antes de contar y paginar", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ total: 125n }])
      .mockResolvedValueOnce([{ id: "registro-51" }]);
    const findMany = vi.fn().mockResolvedValue([{ id: "registro-51" }]);
    const resultado = await consultarRegistrosZoomImportados(
      { $queryRaw: queryRaw, eventoProveedor: { findMany } } as never,
      { busqueda: "  Educación%_  ", pagina: "2" }
    );
    expect(resultado).toMatchObject({ pagina: 2, totalPaginas: 3, total: 125, busqueda: "Educación%_" });
    const conteo = queryRaw.mock.calls[0][0];
    const pagina = queryRaw.mock.calls[1][0];
    expect(conteo.text).toContain("normalize(");
    expect(conteo.text).toContain("regexp_replace(");
    expect(conteo.text).toContain("strpos(");
    expect(conteo.text).not.toContain("Educación%_");
    expect(conteo.values).toContain("educacion%_");
    expect(pagina.values).toContain(50);
    expect(findMany.mock.calls[0][0].where.id.in).toEqual(["registro-51"]);
  });
  it("busca en toda la colección y consulta la página solicitada", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ total: 125n }])
      .mockResolvedValueOnce([{ id: "registro-51" }]);
    const findMany = vi.fn().mockResolvedValue([{ id: "registro-51" }]);
    const resultado = await consultarRegistrosZoomImportados(
      { $queryRaw: queryRaw, eventoProveedor: { findMany } } as never,
      { busqueda: "  educación  ", pagina: "2" }
    );

    expect(resultado).toMatchObject({ pagina: 2, totalPaginas: 3, total: 125, busqueda: "educación" });
    expect(resultado.registros).toEqual([{ id: "registro-51" }]);
    expect(queryRaw.mock.calls[0][0].text).toContain("ZOOM_HISTORICO");
    expect(queryRaw.mock.calls[1][0].values).toContain(50);
    expect(findMany.mock.calls[0][0].where.id.in).toEqual(["registro-51"]);
  });

  it("ajusta páginas inválidas o fuera de rango", async () => {
    const count = vi.fn().mockResolvedValue(51);
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { eventoProveedor: { count, findMany } } as never;
    expect((await consultarRegistrosZoomImportados(db, { pagina: "999" })).pagina).toBe(2);
    expect(findMany.mock.calls[0][0].skip).toBe(50);
    expect((await consultarRegistrosZoomImportados(db, { pagina: "1.5" })).pagina).toBe(1);
    expect((await consultarRegistrosZoomImportados(db, { busqueda: ["uno", "dos"] })).busqueda).toBe("");
  });

  it("mantiene la búsqueda al navegar y permite limpiarla", () => {
    const html = renderToStaticMarkup(
      createElement(HistoricalMeetingsTable, {
        meetings: [],
        busqueda: "Zoom & clase",
        pagina: 2,
        totalPaginas: 3,
        total: 101
      })
    );
    expect(html).toContain('name="seccion" value="historico"');
    expect(html).toContain("Zoom+%26+clase");
    expect(html).toContain("Página 2 de 3");
    expect(html).toContain("Limpiar búsqueda");
  });

  it("distingue una colección vacía de una búsqueda sin coincidencias", () => {
    const vacio = renderToStaticMarkup(
      createElement(HistoricalMeetingsTable, {
        meetings: [],
        busqueda: "",
        pagina: 1,
        totalPaginas: 1,
        total: 0
      })
    );
    const sinCoincidencias = renderToStaticMarkup(
      createElement(HistoricalMeetingsTable, {
        meetings: [],
        busqueda: "seminario",
        pagina: 1,
        totalPaginas: 1,
        total: 0
      })
    );
    expect(vacio).toContain("Todavía no hay registros Zoom importados.");
    expect(vacio).not.toContain("Probá con otro título");
    expect(sinCoincidencias).toContain("Probá con otro título, programa o cuenta.");
  });
});
