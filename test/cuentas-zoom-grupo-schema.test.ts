import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function bloque(modelo: string) {
  const inicio = schema.indexOf(`model ${modelo} {`);
  if (inicio < 0) {
    throw new Error(`Modelo ${modelo} no encontrado`);
  }
  return schema.slice(inicio, schema.indexOf("}", inicio));
}

describe("esquema de cuentas Zoom por grupo", () => {
  it("ConfiguracionZoom guarda el grupo y el estado de sincronización", () => {
    const modelo = bloque("ConfiguracionZoom");
    for (const campo of [
      "grupoId",
      "grupoNombre",
      "ultimaSincronizacionAt",
      "ultimaSincronizacionResultado",
      "sincronizandoDesdeAt"
    ]) {
      expect(modelo).toContain(`  ${campo} `);
    }
  });

  it("CuentaProveedor marca el origen por grupo y la salida del grupo", () => {
    const modelo = bloque("CuentaProveedor");
    expect(modelo).toMatch(/origenGrupoZoom\s+Boolean\s+@default\(false\)/);
    expect(modelo).toMatch(/fueraDelGrupoAt\s+DateTime\?/);
  });
});
