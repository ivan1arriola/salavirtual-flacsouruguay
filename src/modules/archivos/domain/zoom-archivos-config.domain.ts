import type { LimitesCupoZoom } from "./zoom-inventario-estado.domain";

const GB = 1024n ** 3n;
const MIB = 1024 * 1024;
const MULTIPLO_BLOQUE_BYTES = 256 * 1024;

export type ConfiguracionZoomArchivos = Readonly<{
  limites: LimitesCupoZoom;
  corteDias: number;
  concurrencia: number;
  leaseMs: number;
  heartbeatMs: number;
  margenLeaseMs: number;
  bloqueBytes: number;
  esperaVaciaMs: number;
  intervaloMantenimientoMs: number;
  /** Carpeta de administración (fuera de la raíz legible por docentes) para históricos sin vincular. */
  driveHistoricoId: string | null;
}>;

type Entorno = Readonly<Record<string, string | undefined>>;

function entero(
  env: Entorno,
  nombre: string,
  defecto: number,
  minimo: number,
  maximo: number,
): number {
  const crudo = env[`ZOOM_ARCHIVOS_${nombre}`]?.trim();
  if (crudo === undefined || crudo === "") {
    return defecto;
  }
  const valor = Number(crudo);
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new RangeError(`ZOOM_ARCHIVOS_${nombre} debe ser un entero entre ${minimo} y ${maximo}.`);
  }
  return valor;
}

/** Lee y valida la configuración del worker; un valor inválido impide arrancar en vez de degradarse en silencio. */
export function leerConfiguracionZoomArchivos(env: Entorno): ConfiguracionZoomArchivos {
  const topeGb = entero(env, "TOPE_GB", 80, 1, 100_000);
  const reservaGb = entero(env, "RESERVA_RECIENTE_GB", 20, 0, 100_000);
  if (reservaGb > topeGb) {
    throw new RangeError(
      "ZOOM_ARCHIVOS_RESERVA_RECIENTE_GB no puede superar ZOOM_ARCHIVOS_TOPE_GB.",
    );
  }

  const bloqueMib = entero(env, "BLOQUE_MIB", 8, 1, 256);
  const bloqueBytes = bloqueMib * MIB;
  if (bloqueBytes % MULTIPLO_BLOQUE_BYTES !== 0) {
    throw new RangeError("ZOOM_ARCHIVOS_BLOQUE_MIB debe producir un múltiplo de 256 KiB.");
  }

  const leaseMs = entero(env, "LEASE_MS", 300_000, 10_000, 3_600_000);
  const margenLeaseMs = entero(env, "MARGEN_LEASE_MS", 60_000, 1_000, 3_600_000);
  if (margenLeaseMs >= leaseMs) {
    throw new RangeError(
      "ZOOM_ARCHIVOS_MARGEN_LEASE_MS debe ser menor que ZOOM_ARCHIVOS_LEASE_MS.",
    );
  }
  const heartbeatMs = entero(env, "HEARTBEAT_MS", 30_000, 1_000, 3_600_000);
  if (heartbeatMs >= leaseMs - margenLeaseMs) {
    throw new RangeError("ZOOM_ARCHIVOS_HEARTBEAT_MS debe ser menor que el lease menos su margen.");
  }

  const historico = env["ZOOM_ARCHIVOS_DRIVE_HISTORICO_ID"]?.trim();
  return {
    limites: {
      topeBytes: BigInt(topeGb) * GB,
      reservaRecienteBytes: BigInt(reservaGb) * GB,
      ventanaMs: 24 * 3_600_000,
    },
    corteDias: entero(env, "CORTE_DIAS", 90, 1, 3650),
    concurrencia: entero(env, "CONCURRENCIA", 1, 1, 8),
    leaseMs,
    heartbeatMs,
    margenLeaseMs,
    bloqueBytes,
    esperaVaciaMs: entero(env, "ESPERA_VACIA_MS", 15_000, 100, 3_600_000),
    intervaloMantenimientoMs: entero(env, "MANTENIMIENTO_MS", 60_000, 1_000, 86_400_000),
    driveHistoricoId: historico ? historico : null,
  };
}
