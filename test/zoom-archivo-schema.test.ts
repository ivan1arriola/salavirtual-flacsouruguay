import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const carpetaMigracion = readdirSync(new URL("../prisma/migrations/", import.meta.url))
  .find((nombre) => nombre.endsWith("_zoom_archivos_asistencia"));
const rutaSql = carpetaMigracion
  ? new URL(`../prisma/migrations/${carpetaMigracion}/migration.sql`, import.meta.url)
  : null;
const sql = rutaSql && existsSync(rutaSql) ? readFileSync(rutaSql, "utf8") : "";

function modelo(nombre: string): string {
  const match = schema.match(new RegExp(`model ${nombre} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`No existe el modelo ${nombre}.`);
  return match[1];
}

function enumeracion(nombre: string): string[] {
  const match = schema.match(new RegExp(`enum ${nombre} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`No existe el enum ${nombre}.`);
  return match[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
}

function campo(bloque: string, nombre: string): string {
  const linea = bloque.split("\n").find((l) => new RegExp(`^\\s+${nombre}\\s`).test(l));
  if (!linea) throw new Error(`No existe el campo ${nombre}.`);
  return linea.trim();
}

describe("schema de inventario Zoom", () => {
  it("OcurrenciaArchivoZoom identifica la ocurrencia por cuenta y UUID, con encuentro opcional no único", () => {
    const m = modelo("OcurrenciaArchivoZoom");
    for (const c of ["cuentaZoomId", "uuid", "meetingId", "anfitrionZoomId", "inicioRealAt", "titulo"]) {
      expect(campo(m, c)).toMatch(/\sString\s|\sDateTime\s|\sString$|\sDateTime$/);
    }
    expect(campo(m, "cuentaProveedorId")).toMatch(/String\?/);
    expect(campo(m, "eventoProveedorId")).toMatch(/String\?/);
    expect(campo(m, "eventoProveedorId")).not.toContain("@unique");
    for (const c of ["driveFolderId", "inventariadoAt", "proximoInventarioAt", "estadoAsistencia", "errorAsistencia",
      "procesamientoPendiente", "vinculadaAt", "vinculadaPorId", "createdAt", "updatedAt"]) {
      expect(m, c).toMatch(new RegExp(`\\n\\s+${c}\\s`));
    }
    expect(m).toContain("@@unique([cuentaZoomId, uuid])");
    expect(m).toContain("@@index([eventoProveedorId])");
    expect(m).toContain("@@index([proximoInventarioAt])");
    expect(m).toMatch(/eventoProveedor\s+EventoProveedor\?\s+@relation\([^)]*onDelete: SetNull/);
    expect(m).toMatch(/cuentaProveedor\s+CuentaProveedor\?\s+@relation\([^)]*onDelete: SetNull/);
    expect(m).toMatch(/vinculadaPor\s+Usuario\?\s+@relation\([^)]*onDelete: SetNull/);
  });

  it("ArchivoOrigenZoom guarda identidad, metadatos, estado, lease y destino sin borrado en cascada", () => {
    const m = modelo("ArchivoOrigenZoom");
    for (const c of ["ocurrenciaId", "claveOrigen", "archivoZoomId", "coleccion", "tipoOriginal", "variante", "extension",
      "inicioAt", "finAt", "tamanoBytes", "estadoOrigen", "descargable", "multiplicidadObservada", "estado",
      "errorCodigo", "errorDetalle", "intentos", "proximoIntentoAt", "leaseVersion", "leaseHasta", "driveFileId",
      "archivoReunionId", "uploadSessionCifrada", "bytesConfirmados", "nombreDestino", "mimeType", "webViewUrl",
      "ultimaObservacionAt", "conservadoAt", "createdAt", "updatedAt"]) {
      expect(m, c).toMatch(new RegExp(`\\n\\s+${c}\\s`));
    }
    expect(campo(m, "tamanoBytes")).toMatch(/BigInt\?/);
    expect(campo(m, "bytesConfirmados")).toMatch(/BigInt\s+@default\(0\)/);
    expect(campo(m, "driveFileId")).toMatch(/String\?\s+@unique/);
    expect(campo(m, "archivoReunionId")).toMatch(/String\?\s+@unique/);
    expect(campo(m, "leaseVersion")).toMatch(/Int\s+@default\(0\)/);
    expect(campo(m, "estado")).toMatch(/EstadoArchivoZoom\s+@default\(DESCUBIERTO\)/);
    expect(m).toContain("@@unique([ocurrenciaId, claveOrigen])");
    expect(m).toContain("@@unique([ocurrenciaId, nombreDestino])");
    expect(m).toContain("@@index([estado, proximoIntentoAt])");
    expect(m).toContain("@@index([estado, leaseHasta])");
    expect(m).toMatch(/ocurrencia\s+OcurrenciaArchivoZoom\s+@relation\([^)]*onDelete: Restrict/);
    expect(m).toMatch(/archivoReunion\s+ArchivoReunion\?\s+@relation\([^)]*onDelete: SetNull/);
  });

  it("los estados del inventario coinciden con el contrato compartido", () => {
    expect(enumeracion("EstadoArchivoZoom")).toEqual([
      "DESCUBIERTO", "PROCESANDO_ORIGEN", "PENDIENTE", "COPIANDO", "CONSERVADO", "ERROR_REINTENTABLE", "REQUIERE_REVISION"
    ]);
    expect(enumeracion("PrioridadTransferenciaZoom")).toEqual(["RECIENTE", "HISTORICO"]);
  });

  it("BarridoArchivoZoom es reanudable y acota reintentos", () => {
    const m = modelo("BarridoArchivoZoom");
    for (const c of ["cuentaZoomId", "anfitrionesSnapshot", "desde", "hasta", "anfitrionIndice", "ventanaDesde",
      "ventanaHasta", "nextPageTokenCifrado", "estado", "paginasProcesadas", "ocurrenciasEncontradas",
      "archivosEncontrados", "intentos", "proximoIntentoAt", "errorCodigo", "errorDetalle", "leaseVersion",
      "leaseHasta", "solicitanteId", "createdAt", "updatedAt"]) {
      expect(m, c).toMatch(new RegExp(`\\n\\s+${c}\\s`));
    }
    expect(campo(m, "anfitrionesSnapshot")).toMatch(/Json/);
    expect(campo(m, "intentos")).toMatch(/Int\s+@default\(0\)/);
    expect(m).toMatch(/solicitante\s+Usuario\?\s+@relation\([^)]*onDelete: SetNull/);
    expect(m).toContain("@@index([estado, proximoIntentoAt])");
    expect(m).toContain("@@index([estado, leaseHasta])");
  });

  it("ReservaTransferenciaZoom registra reservas exactas para la ventana móvil", () => {
    const m = modelo("ReservaTransferenciaZoom");
    expect(campo(m, "bytesReservados")).toMatch(/BigInt$/);
    expect(campo(m, "ajustadoBytes")).toMatch(/BigInt\?/);
    expect(campo(m, "prioridad")).toMatch(/PrioridadTransferenciaZoom/);
    expect(campo(m, "reservadoAt")).toMatch(/DateTime$/);
    expect(campo(m, "liberadoAt")).toMatch(/DateTime\?/);
    // Offset confirmado al reservar: permite cerrar la reserva de un intento caído con lo transferido.
    expect(campo(m, "bytesConfirmadosInicio")).toMatch(/BigInt\s+@default\(0\)/);
    expect(sql).toMatch(/"bytesConfirmadosInicio" BIGINT NOT NULL DEFAULT 0/);
    expect(m).toContain("@@index([reservadoAt])");
    expect(m).toMatch(/archivoOrigen\s+ArchivoOrigenZoom\s+@relation\([^)]*onDelete: Restrict/);
  });

  it("no altera las restricciones de ArchivoReunion ni EventoProveedor de Meet", () => {
    const archivo = modelo("ArchivoReunion");
    expect(archivo).toContain("@@unique([eventoProveedorId, externalResourceName])");
    expect(campo(archivo, "driveFileId")).toMatch(/String\s+@unique/);
    expect(modelo("EventoProveedor")).toContain("@@unique([instanciaSalaId, proveedorId])");
  });
});

describe("migración aditiva de inventario Zoom", () => {
  it("existe con un timestamp posterior a la última migración previa", () => {
    expect(carpetaMigracion).toBeDefined();
    expect(carpetaMigracion! > "20261105190000").toBe(true);
    expect(sql.length).toBeGreaterThan(0);
  });

  it("crea los tipos, tablas e índices nuevos", () => {
    for (const tipo of ["EstadoArchivoZoom", "EstadoBarridoArchivoZoom", "PrioridadTransferenciaZoom"]) {
      expect(sql).toContain(`CREATE TYPE "${tipo}"`);
    }
    for (const tabla of ["OcurrenciaArchivoZoom", "ArchivoOrigenZoom", "BarridoArchivoZoom", "ReservaTransferenciaZoom"]) {
      expect(sql).toContain(`CREATE TABLE "${tabla}"`);
    }
    expect(sql).toContain('CREATE UNIQUE INDEX "OcurrenciaArchivoZoom_cuentaZoomId_uuid_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "ArchivoOrigenZoom_ocurrenciaId_claveOrigen_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "ArchivoOrigenZoom_driveFileId_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "ArchivoOrigenZoom_archivoReunionId_key"');
    expect(sql).toContain('CREATE INDEX "ReservaTransferenciaZoom_reservadoAt_idx"');
  });

  it("solo es aditiva: sin DROP, sin TRUNCATE/DELETE/UPDATE y sin alterar tablas existentes", () => {
    const sinComentarios = sql.replace(/--.*$/gm, "");
    expect(sinComentarios).not.toMatch(/\bDROP\b/i);
    expect(sinComentarios).not.toMatch(/\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/i);
    expect(sinComentarios).not.toMatch(/\bRENAME\b/i);
    const alteradas = [...sinComentarios.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1]);
    const nuevas = new Set(["OcurrenciaArchivoZoom", "ArchivoOrigenZoom", "BarridoArchivoZoom", "ReservaTransferenciaZoom"]);
    expect(alteradas.filter((t) => !nuevas.has(t))).toEqual([]);
    const alteraciones = [...sinComentarios.matchAll(/ALTER TABLE "[^"]+" ([A-Z]+ [A-Z]+)/g)].map((m) => m[1]);
    expect(new Set(alteraciones)).toEqual(new Set(["ADD CONSTRAINT"]));
  });

  it("las FK opcionales usan SET NULL y las obligatorias impiden borrados en cascada", () => {
    const fk = (nombre: string) => {
      const match = sql.match(new RegExp(`CONSTRAINT "${nombre}" FOREIGN KEY[^;]*;`));
      if (!match) throw new Error(`Falta la FK ${nombre}`);
      return match[0];
    };
    for (const nombre of [
      "OcurrenciaArchivoZoom_eventoProveedorId_fkey",
      "OcurrenciaArchivoZoom_cuentaProveedorId_fkey",
      "OcurrenciaArchivoZoom_vinculadaPorId_fkey",
      "ArchivoOrigenZoom_archivoReunionId_fkey",
      "BarridoArchivoZoom_solicitanteId_fkey"
    ]) {
      expect(fk(nombre)).toContain("ON DELETE SET NULL");
    }
    expect(fk("ArchivoOrigenZoom_ocurrenciaId_fkey")).toContain("ON DELETE RESTRICT");
    expect(fk("ReservaTransferenciaZoom_archivoOrigenId_fkey")).toContain("ON DELETE RESTRICT");
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
  });
});
