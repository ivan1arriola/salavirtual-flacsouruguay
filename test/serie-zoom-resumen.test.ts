import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resumirSerieZoom } from "../src/modules/reuniones/serie-zoom-resumen.domain";

const encuentro = (joinUrl: string | null, cuenta: string | null) => ({
  proveedorActivoTipo: "ZOOM",
  eventosProveedor: [{
    joinUrl,
    proveedor: { tipo: "ZOOM" },
    cuentaProveedor: cuenta ? { nombre: cuenta, emailOrganizador: `${cuenta}@flacso.edu.uy` } : null
  }]
});

describe("resumen de serie Zoom", () => {
  it("una serie con la misma cuenta y el mismo enlace está unificada", () => {
    const resumen = resumirSerieZoom([encuentro("https://zoom.us/j/1", "sala01"), encuentro("https://zoom.us/j/1", "sala01")]);
    expect(resumen).toEqual({ unificada: true, cuentas: ["sala01@flacso.edu.uy"], enlaces: ["https://zoom.us/j/1"] });
  });

  it("enlaces distintos o cuentas distintas piden corrección", () => {
    expect(resumirSerieZoom([encuentro("https://zoom.us/j/1", "sala01"), encuentro("https://zoom.us/j/2", "sala01")]).unificada).toBe(false);
    expect(resumirSerieZoom([encuentro("https://zoom.us/j/1", "sala01"), encuentro("https://zoom.us/j/1", "sala02")]).unificada).toBe(false);
  });

  it("encuentros sin enlace ni cuenta todavía no cuentan como distintos", () => {
    expect(resumirSerieZoom([encuentro(null, null), encuentro("https://zoom.us/j/1", "sala01")]).unificada).toBe(true);
  });
});

describe("lista Zoom por serie", () => {
  const pagina = readFileSync(new URL("../src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx", import.meta.url), "utf8");
  it("permite agrupar por reunión o por serie y ofrece corregir solo a Administración", () => {
    expect(pagina).toContain("Por reunión");
    expect(pagina).toContain("Por serie");
    expect(pagina).toContain("esAdmin && !isHistory ? <CorregirSerieZoomBoton");
  });
});
