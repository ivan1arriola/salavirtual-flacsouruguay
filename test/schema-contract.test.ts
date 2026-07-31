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

  it("permite varias cuentas Google FLACSO por usuario local", () => {
    expect(schema).toContain("model CuentaGoogleFlacso");
    expect(schema).toContain("cuentasGoogle");
    expect(schema).toContain("passwordHash");
  });

  it("usa roles neutrales y absorbe Contabilidad en Administracion", () => {
    expect(schema).toContain("ADMINISTRACION");
    expect(schema).not.toContain("CONTADURIA");
    expect(schema).not.toContain("ADMINISTRADOR");
  });

  it("origina solicitudes desde la asociacion docente-programa", () => {
    expect(schema).toContain("model DocentePrograma");
    expect(schema).toContain("docenteProgramaId");
  });

  it("conserva trazabilidad de fusiones de usuarios docentes", () => {
    expect(schema).toContain("model UsuarioFusion");
    expect(schema).toContain("fusionadoEnId");
  });
});
