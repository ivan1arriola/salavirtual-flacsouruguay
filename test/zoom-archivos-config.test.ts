import { describe, expect, it } from "vitest";
import { leerConfiguracionZoomArchivos } from "../src/modules/archivos/domain/zoom-archivos-config.domain";

const GB = 1024n ** 3n;

describe("leerConfiguracionZoomArchivos", () => {
  it("valores por defecto del plan: tope 80 GB, reserva 20 GB, corte 90 días, 1 archivo, lease 5 min, heartbeat 30 s, bloque 8 MiB", () => {
    const c = leerConfiguracionZoomArchivos({});
    expect(c.limites).toEqual({
      topeBytes: 80n * GB,
      reservaRecienteBytes: 20n * GB,
      ventanaMs: 24 * 3_600_000,
    });
    expect(c).toMatchObject({
      corteDias: 90,
      concurrencia: 1,
      leaseMs: 300_000,
      heartbeatMs: 30_000,
      bloqueBytes: 8 * 1024 * 1024,
      margenLeaseMs: 60_000,
    });
    expect(c.driveHistoricoId).toBeNull();
  });

  it("lee las variables ZOOM_ARCHIVOS_*", () => {
    const c = leerConfiguracionZoomArchivos({
      ZOOM_ARCHIVOS_TOPE_GB: "40",
      ZOOM_ARCHIVOS_RESERVA_RECIENTE_GB: "10",
      ZOOM_ARCHIVOS_CORTE_DIAS: "30",
      ZOOM_ARCHIVOS_CONCURRENCIA: "2",
      ZOOM_ARCHIVOS_BLOQUE_MIB: "16",
      ZOOM_ARCHIVOS_DRIVE_HISTORICO_ID: " carpeta ",
    });
    expect(c.limites.topeBytes).toBe(40n * GB);
    expect(c.limites.reservaRecienteBytes).toBe(10n * GB);
    expect(c).toMatchObject({
      corteDias: 30,
      concurrencia: 2,
      bloqueBytes: 16 * 1024 * 1024,
      driveHistoricoId: "carpeta",
    });
  });

  it.each([
    [{ ZOOM_ARCHIVOS_TOPE_GB: "abc" }, /TOPE_GB/],
    [{ ZOOM_ARCHIVOS_TOPE_GB: "0" }, /TOPE_GB/],
    [
      { ZOOM_ARCHIVOS_TOPE_GB: "10", ZOOM_ARCHIVOS_RESERVA_RECIENTE_GB: "20" },
      /RESERVA_RECIENTE_GB/,
    ],
    [{ ZOOM_ARCHIVOS_CONCURRENCIA: "0" }, /CONCURRENCIA/],
    [{ ZOOM_ARCHIVOS_CONCURRENCIA: "99" }, /CONCURRENCIA/],
    [{ ZOOM_ARCHIVOS_BLOQUE_MIB: "0" }, /BLOQUE_MIB/],
    [{ ZOOM_ARCHIVOS_BLOQUE_MIB: "1.5" }, /BLOQUE_MIB/],
    [{ ZOOM_ARCHIVOS_CORTE_DIAS: "-1" }, /CORTE_DIAS/],
  ])("rechaza valores inválidos %j", (env, mensaje) => {
    expect(() => leerConfiguracionZoomArchivos(env)).toThrow(mensaje);
  });

  it("el margen del lease debe ser menor que el lease y el heartbeat menor que el margen del lease", () => {
    expect(() =>
      leerConfiguracionZoomArchivos({
        ZOOM_ARCHIVOS_LEASE_MS: "30000",
        ZOOM_ARCHIVOS_MARGEN_LEASE_MS: "60000",
      }),
    ).toThrow(/MARGEN_LEASE_MS/);
    expect(() => leerConfiguracionZoomArchivos({ ZOOM_ARCHIVOS_HEARTBEAT_MS: "250000" })).toThrow(
      /HEARTBEAT_MS/,
    );
  });
});
