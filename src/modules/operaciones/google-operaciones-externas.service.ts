import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * A persistent one-shot boundary for POST operations that cannot be blindly
 * retried. A crash after the remote POST starts intentionally leaves ENVIANDO.
 * Only a verified remote reconciliation (or a human) can resolve it.
 */
export class GoogleOperacionInciertaError extends Error {
  constructor(public readonly clave: string) {
    super("La operación externa requiere conciliación. No se repetirá automáticamente.");
    this.name = "GoogleOperacionInciertaError";
  }
}

export class GoogleCuentaOcupadaError extends Error {
  constructor() {
    super("La cuenta de Google tiene otra escritura en curso. Reintentá más tarde.");
    this.name = "GoogleCuentaOcupadaError";
  }
}

export type GoogleOperationKind = "MEET_CREAR_ESPACIO" | "DRIVE_CREAR_CARPETA" |
  "DRIVE_SUBIR_DOCUMENTO" | "GMAIL_ENVIAR";

export type GoogleOperationSpec = Readonly<{
  clave: string;
  proveedor: "MEET" | "DRIVE" | "GMAIL";
  tipo: GoogleOperationKind;
  cuenta: string;
  /** Non-secret entity ID for operator correlation (never raw message bodies). */
  referencia?: string;
}>;

const ACCOUNT_LEASE_MS = 120_000;

export function claveOperacionGoogle(tipo: GoogleOperationKind, ...parts: readonly string[]): string {
  const encoded = JSON.stringify([tipo, ...parts]);
  return `gop:${createHash("sha256").update(encoded).digest("hex")}`;
}

export async function ejecutarGooglePostUnaVez<T>(
  db: PrismaClient,
  spec: GoogleOperationSpec,
  send: () => Promise<T>,
  serialize: (result: T) => Record<string, string>,
  restore: (data: Record<string, string>) => T,
): Promise<T> {
  const registered = await db.googleOperacionExterna.upsert({
    where: { clave: spec.clave },
    create: {
      clave: spec.clave, proveedor: spec.proveedor,
      tipo: spec.tipo, cuenta: spec.cuenta, referencia: spec.referencia ?? null, estado: "RESERVADA"
    },
    update: {}
  });
  // Fail closed if the same key is accidentally reused for another operation.
  if (registered.proveedor !== spec.proveedor || registered.tipo !== spec.tipo ||
      registered.cuenta !== spec.cuenta) {
    throw new GoogleOperacionInciertaError(spec.clave);
  }
  if (registered.estado === "CONFIRMADA") {
    if (!registered.resultado || typeof registered.resultado !== "object" ||
        Array.isArray(registered.resultado)) throw new GoogleOperacionInciertaError(spec.clave);
    const record = registered.resultado as Record<string, unknown>;
    if (!Object.values(record).every((value) => typeof value === "string")) {
      throw new GoogleOperacionInciertaError(spec.clave);
    }
    return restore(record as Record<string, string>);
  }
  if (registered.estado !== "RESERVADA") throw new GoogleOperacionInciertaError(spec.clave);

  const leaseKey = `${spec.proveedor}:${spec.cuenta}`;
  const now = new Date();
  const token = randomUUID();
  await db.googleCuentaLease.upsert({
    where: { clave: leaseKey },
    create: { clave: leaseKey, token: null, venceAt: new Date(0) },
    update: {}
  });
  const lease = await db.googleCuentaLease.updateMany({
    where: { clave: leaseKey, venceAt: { lte: now } },
    data: { token, venceAt: new Date(now.getTime() + ACCOUNT_LEASE_MS) }
  });
  if (lease.count !== 1) throw new GoogleCuentaOcupadaError();

  try {
    const claimed = await db.googleOperacionExterna.updateMany({
      where: { clave: spec.clave, estado: "RESERVADA" },
      data: { estado: "ENVIANDO", intentos: { increment: 1 }, iniciadaAt: new Date() }
    });
    if (claimed.count !== 1) {
      throw new GoogleOperacionInciertaError(spec.clave);
    }

    try {
      const result = await send();
      const safe = serialize(result);
      if (Object.values(safe).some((value) => typeof value !== "string")) {
        throw new Error("Google no devolvió un identificador remoto válido.");
      }
      await db.googleOperacionExterna.update({
        where: { clave: spec.clave },
        data: { estado: "CONFIRMADA", resultado: safe, terminadaAt: new Date(), errorCodigo: null }
      });
      return result;
    } catch (error) {
      // Do not expose remote response bodies, addresses or credentials.
      await db.googleOperacionExterna.updateMany({
        where: { clave: spec.clave, estado: "ENVIANDO" },
        data: { estado: "INCIERTA", errorCodigo: "RESULTADO_REMOTO_NO_CONFIRMADO" }
      }).catch(() => {
        // If the DB itself failed, ENVIANDO still prevents a replay.
      });
      throw new GoogleOperacionInciertaError(spec.clave);
    }
  } finally {
    await db.googleCuentaLease.updateMany({
      where: { clave: leaseKey, token },
      data: { token: null, venceAt: new Date(0) }
    }).catch(() => {
      // Lease will expire; an ENVIANDO operation remains permanently non-replayable.
    });
  }
}

/**
 * Mark an uncertain POST confirmed ONLY after the caller has verified the
 * remote object with a separate GET. Never move ENVIANDO to CONFIRMADA:
 * that request might still be in flight.
 */
export async function confirmarGoogleOperacionVerificada(
  db: PrismaClient,
  clave: string,
  resultado: Record<string, string>
): Promise<boolean> {
  if (!resultado.id || Object.values(resultado).some((value) => typeof value !== "string")) {
    throw new Error("La prueba remota no incluye un ID válido.");
  }
  const updated = await db.googleOperacionExterna.updateMany({
    where: { clave, estado: "INCIERTA" },
    data: {
      estado: "CONFIRMADA", resultado, errorCodigo: null, terminadaAt: new Date()
    }
  });
  return updated.count === 1;
}
