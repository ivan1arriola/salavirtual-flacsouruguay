import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

function model(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) {
    throw new Error(`No existe el modelo ${name}.`);
  }
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

  it("modela notificaciones dirigidas con estado de lectura", () => {
    const notificacion = model("Notificacion");
    const preferencia = model("PreferenciaNotificacion");
    const usuario = model("Usuario");
    expect(usuario).toContain("notificaciones");
    expect(usuario).toContain("preferenciasNotificacion");
    expect(notificacion).toContain("usuarioId");
    expect(notificacion).toContain("leidaAt");
    expect(notificacion).toContain("href");
    expect(notificacion).toContain("@@index([usuarioId, leidaAt, createdAt])");
    expect(preferencia).toContain("push      Boolean  @default(true)");
    expect(preferencia).toContain("email     Boolean  @default(true)");
    expect(preferencia).toContain("@@unique([usuarioId, tipo])");
  });
});

describe("reunión compartida por serie", () => {
  const migraciones = readdirSync(new URL("../prisma/migrations/", import.meta.url));
  const carpeta = migraciones.find((nombre) => nombre.endsWith("_reunion_proveedor_compartida"));
  const sql = carpeta
    ? readFileSync(
        new URL(`../prisma/migrations/${carpeta}/migration.sql`, import.meta.url),
        "utf8",
      )
    : "";

  it("define ReunionProveedor con estado de creación persistido y sus unicidades", () => {
    const reunion = model("ReunionProveedor");
    for (const campo of [
      "serieClave",
      "externalId",
      "joinUrl",
      "estadoCreacion",
      "reclamoToken",
      "reclamoAt",
    ]) {
      expect(reunion, campo).toContain(campo);
    }
    expect(reunion).toContain("@@unique([proveedorId, externalId])");
    expect(reunion).toContain("@@unique([proveedorId, serieClave])");
  });

  it("EventoProveedor referencia la reunión compartida y ya no exige un ID externo único", () => {
    const evento = model("EventoProveedor");
    expect(evento).toContain("reunionProveedorId");
    expect(evento).not.toContain("@@unique([proveedorId, externalEventId])");
    expect(evento).toContain("@@index([proveedorId, externalEventId])");
    expect(evento).toContain("@@unique([instanciaSalaId, proveedorId])");
  });

  it("define el avance por cita de Calendar y los avisos por serie", () => {
    const cita = model("CambioEnlaceCita");
    for (const campo of [
      "enlaceNuevo",
      "estado",
      "reunionAnteriorExternalId",
      "eliminarDespuesDe",
      "reunionAnteriorEliminadaAt",
      "sinCita",
    ]) {
      expect(cita, campo).toContain(campo);
    }
    expect(cita).toContain("@@unique([instanciaSalaId, reunionProveedorId])");
    const aviso = model("AvisoEnlaceSerie");
    expect(aviso).toContain("@@unique([serieClave, email, tipo])");
  });

  it("la migración crea las tablas, agrega la columna y reemplaza el índice único", () => {
    expect(carpeta).toBeDefined();
    expect(sql).toContain('CREATE TABLE "ReunionProveedor"');
    expect(sql).toContain('CREATE TABLE "CambioEnlaceCita"');
    expect(sql).toContain('CREATE TABLE "AvisoEnlaceSerie"');
    expect(sql).toContain('ADD COLUMN "reunionProveedorId"');
    expect(sql).toMatch(
      /DROP INDEX (IF EXISTS )?"EventoProveedor_proveedorId_externalEventId_key"/,
    );
  });
});
