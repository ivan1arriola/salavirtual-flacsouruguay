import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETA_CUENTAS_ZOOM, TAMANO_PALETA_CUENTAS, resumenCuentasAnfitrionas } from "../src/modules/reuniones/lista-zoom-agrupacion.domain";

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");
const pagina = leer("../src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx");
const encuentros = leer("../src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx");
const cssLista = leer("../app/(gestion)/reuniones/reuniones-zoom.module.css");

describe("paleta de cuentas de Zoom", () => {
  it("tiene un color por cuenta, todos distintos, y coincide con el CSS de la lista", () => {
    expect(PALETA_CUENTAS_ZOOM).toHaveLength(TAMANO_PALETA_CUENTAS);
    expect(new Set(PALETA_CUENTAS_ZOOM.map(({ fuerte }) => fuerte)).size).toBe(TAMANO_PALETA_CUENTAS);
    PALETA_CUENTAS_ZOOM.forEach(({ fuerte, palido }, indice) => {
      expect(cssLista).toContain(`.item[data-cuenta="${indice}"], .cuentaChip[data-cuenta="${indice}"], .leyenda li[data-cuenta="${indice}"] { --tone: ${fuerte}; --tone-pale: ${palido}; }`);
    });
  });
});

describe("resumenCuentasAnfitrionas", () => {
  it("una sola cuenta se nombra completa", () => {
    expect(resumenCuentasAnfitrionas(["sala02@flacso.edu.uy", "sala02@flacso.edu.uy"])).toEqual({ tipo: "UNA", correos: ["sala02@flacso.edu.uy"] });
  });
  it("varias cuentas distintas se avisan", () => {
    expect(resumenCuentasAnfitrionas(["sala02@flacso.edu.uy", "sala05@flacso.edu.uy", null])).toEqual({ tipo: "VARIAS", correos: ["sala02@flacso.edu.uy", "sala05@flacso.edu.uy"] });
  });
  it("sin cuentas asignadas", () => {
    expect(resumenCuentasAnfitrionas([null, undefined, " "])).toEqual({ tipo: "NINGUNA", correos: [] });
  });
});

describe("detalle de Zoom muestra la cuenta anfitriona", () => {
  it("la página la calcula por encuentro y la resume en el encabezado de la serie", () => {
    expect(pagina).toContain("cuentaAnfitrion: enlace.cuentaAnfitrion");
    expect(pagina).toContain("resumenCuentasAnfitrionas(");
    expect(pagina).toContain("Cuenta anfitriona");
  });
  it("cada encuentro lo muestra en texto con el color de su cuenta", () => {
    expect(encuentros).toContain("cuentaAnfitrion?: string | null;");
    expect(encuentros).toContain("Cuenta anfitriona");
    expect(encuentros).toContain("PALETA_CUENTAS_ZOOM");
  });
});
