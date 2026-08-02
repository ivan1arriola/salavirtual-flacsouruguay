import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

function model(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`No existe el modelo ${name}.`);
  return match[1];
}

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
    expect(schema).toContain("passwordInicialCifrada");
  });

  it("mantiene la identidad directamente en Usuario", () => {
    expect(schema).not.toContain("model Persona");
    expect(schema).toContain("nombres");
    expect(schema).toContain("debeCambiarPassword");
  });

  it("usa roles neutrales y absorbe Contabilidad en Administracion", () => {
    expect(schema).toContain("ADMINISTRACION");
    expect(schema).not.toContain("CONTADURIA");
    expect(schema).not.toContain("ADMINISTRADOR");
  });

  it("origina solicitudes desde la asociacion docente-programa", () => {
    const solicitud = model("SolicitudSala");
    expect(schema).toContain("model DocentePrograma");
    expect(solicitud).toContain("docenteProgramaId");
    expect(solicitud).not.toMatch(/^\s+docenteId\s/m);
    expect(solicitud).not.toMatch(/^\s+programaId\s/m);
  });

  it("conserva trazabilidad de fusiones de usuarios docentes", () => {
    expect(schema).toContain("model UsuarioFusion");
    expect(schema).toContain("fusionadoEnId");
  });

  it("no duplica docente, programa, host ni dias en cada instancia", () => {
    const instancia = model("InstanciaSala");
    expect(instancia).toContain("solicitudSalaId");
    expect(instancia).not.toMatch(/^\s+(docenteId|programaId|cuentaHostId|diaSemana|dias)\s/m);
  });

  it("mantiene codigo y host dentro del evento del proveedor", () => {
    const evento = model("EventoProveedor");
    expect(evento).toContain("cuentaProveedorId");
    expect(evento).toContain("codigoReunion");
  });

  it("normaliza los archivos Meet contra el evento que los produjo", () => {
    const archivo = model("ArchivoReunion");
    expect(archivo).toContain("eventoProveedorId");
    expect(archivo).toContain("externalResourceName");
    expect(archivo).not.toMatch(/^\s+(programaId|docenteId|cuentaHostId|instanciaSalaId)\s/m);
    expect(archivo).toContain("@@unique([eventoProveedorId, externalResourceName])");
  });

  it("modela cohosts como relacion muchos a muchos sin listas embebidas", () => {
    const cohost = model("CohostReunion");
    const instancia = model("InstanciaSala");
    expect(cohost).toContain("instanciaSalaId");
    expect(cohost).toContain("cuentaGoogleId");
    expect(cohost).toContain("@@unique([instanciaSalaId, cuentaGoogleId])");
    expect(instancia).not.toMatch(/^\s+cohostCuentaIds\s/m);
  });
});
