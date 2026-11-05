import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUENTA_ZOOM_ASIGNABLE } from "../src/modules/reuniones/cuenta-asignable.domain";

const ARCHIVOS = [
  "src/modules/reuniones/crear-reuniones.service.ts",
  "src/modules/reuniones/gestionar-encuentros.service.ts",
  "src/modules/reuniones/corregir-serie-enlaces.service.ts",
  "src/modules/reuniones/migracion-zoom-aplicar.service.ts",
  "src/modules/reuniones/migracion-zoom-serie-aplicar.service.ts",
  "src/modules/reuniones/migracion-zoom.service.ts",
  "app/api/v1/reuniones/migracion-zoom/series-enlaces/route.ts"
];

describe("cuenta Zoom asignable", () => {
  it("excluye cuentas inactivas, sin licencia o fuera del grupo", () => {
    expect(CUENTA_ZOOM_ASIGNABLE).toEqual({ activa: true, tieneLicencia: true, fueraDelGrupoAt: null });
  });

  it.each(ARCHIVOS)("%s usa CUENTA_ZOOM_ASIGNABLE", (archivo) => {
    const texto = readFileSync(archivo, "utf8");
    expect(texto).toContain("...CUENTA_ZOOM_ASIGNABLE");
    expect(texto).not.toContain("activa: true, tieneLicencia: true");
  });
});
