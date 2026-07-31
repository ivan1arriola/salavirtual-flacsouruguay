import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

describe("schema 3NF inicial", () => {
  it("mantiene proveedor externo separado de la instancia academica", () => {
    expect(schema).toContain("model InstanciaSala");
    expect(schema).toContain("model EventoProveedor");
    expect(schema).toContain("model ProveedorReunion");
  });

  it("no usa modelos centrales con nombres Zoom", () => {
    expect(schema).not.toContain("model CuentaZoom");
    expect(schema).not.toContain("model EventoZoom");
    expect(schema).not.toContain("model AsistenteZoom");
  });
});
