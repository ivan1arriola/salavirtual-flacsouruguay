import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  claveOperacionGoogle,
  confirmarGoogleOperacionVerificada,
  ejecutarGooglePostUnaVez,
  GoogleOperacionInciertaError,
  GoogleCuentaOcupadaError
} from "../src/modules/operaciones/google-operaciones-externas.service";

type Operation = {
  clave: string; proveedor: string; tipo: string; cuenta: string; estado: string;
  resultado?: Record<string, string> | null; intentos: number;
};
type Lease = { clave: string; token: string | null; venceAt: Date };

function fixture() {
  const operations = new Map<string, Operation>();
  const leases = new Map<string, Lease>();
  const db = {
    googleOperacionExterna: {
      upsert: vi.fn(async (query: { where: { clave: string }; create: Operation }) => {
        let entry = operations.get(query.where.clave);
        if (!entry) {
          entry = { ...query.create, intentos: 0, resultado: null };
          operations.set(query.where.clave, entry);
        }
        return { ...entry };
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { clave: string; estado: string };
        data: { estado: string; intentos?: { increment: number }; iniciadaAt?: Date; errorCodigo?: string; resultado?: Record<string, string> }
      }) => {
        const item = operations.get(where.clave);
        if (!item || item.estado !== where.estado) return { count: 0 };
        item.estado = data.estado;
        item.intentos += data.intentos?.increment ?? 0;
        if ("resultado" in data) item.resultado = data.resultado as Record<string, string>;
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: {
        where: { clave: string };
        data: { estado: string; resultado: Record<string, string> }
      }) => {
        const item = operations.get(where.clave);
        if (!item) throw new Error("Missing operation");
        Object.assign(item, data);
        return { ...item };
      })
    },
    googleCuentaLease: {
      upsert: vi.fn(async ({ where, create }: { where: { clave: string }; create: Lease }) => {
        if (!leases.has(where.clave)) leases.set(where.clave, { ...create });
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { clave: string; venceAt?: { lte: Date }; token?: string };
        data: { token: string | null; venceAt: Date };
      }) => {
        const lease = leases.get(where.clave);
        if (!lease) return { count: 0 };
        if (where.venceAt && lease.venceAt > where.venceAt.lte) return { count: 0 };
        if (where.token && lease.token !== where.token) return { count: 0 };
        Object.assign(lease, data);
        return { count: 1 };
      })
    }
  };
  return { db: db as unknown as PrismaClient, operations, leases };
}

const spec = {
  clave: claveOperacionGoogle("MEET_CREAR_ESPACIO", "host-1", "event-1"),
  proveedor: "MEET" as const,
  tipo: "MEET_CREAR_ESPACIO" as const,
  cuenta: "host-1"
};
const serialize = (data: { id: string }) => ({ id: data.id });
const restore = (data: Record<string, string>) => ({ id: data.id! });

describe("Google persistent POST boundary", () => {
  it("stores successful POST and returns the exact same remote ID on replay", async () => {
    const { db, operations } = fixture();
    const send = vi.fn().mockResolvedValue({ id: "spaces/google-1" });
    expect(await ejecutarGooglePostUnaVez(db, spec, send, serialize, restore))
      .toEqual({ id: "spaces/google-1" });
    expect(await ejecutarGooglePostUnaVez(db, spec, send, serialize, restore))
      .toEqual({ id: "spaces/google-1" });
    expect(send).toHaveBeenCalledOnce();
    expect(operations.get(spec.clave)).toMatchObject({
      estado: "CONFIRMADA", intentos: 1, resultado: { id: "spaces/google-1" }
    });
  });

  it("marks ambiguous errors and refuses to repeat POST", async () => {
    const { db, operations } = fixture();
    const send = vi.fn().mockRejectedValue(new Error("socket hang up"));
    await expect(ejecutarGooglePostUnaVez(db, spec, send, serialize, restore))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    expect(operations.get(spec.clave)?.estado).toBe("INCIERTA");
    await expect(ejecutarGooglePostUnaVez(db, spec, send, serialize, restore))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    expect(send).toHaveBeenCalledOnce();
  });

  it("does not replay an ENVIANDO operation left by a crashed worker", async () => {
    const { db, operations } = fixture();
    operations.set(spec.clave, { ...spec, estado: "ENVIANDO", intentos: 1 });
    const send = vi.fn();
    await expect(ejecutarGooglePostUnaVez(db, spec, send, serialize, restore))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    expect(send).not.toHaveBeenCalled();
  });

  it("one account lease refuses simultaneous writes with a different key", async () => {
    const { db } = fixture();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const first = vi.fn(async () => { await pending; return { id: "one" }; });
    const firstCall = ejecutarGooglePostUnaVez(db, spec, first, serialize, restore);
    // Async branches can interleave at DB await; await until first starts sending.
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
    const secondSpec = {
      ...spec, clave: claveOperacionGoogle("MEET_CREAR_ESPACIO", "host-1", "event-2")
    };
    await expect(ejecutarGooglePostUnaVez(db, secondSpec, vi.fn(), serialize, restore))
      .rejects.toBeInstanceOf(GoogleCuentaOcupadaError);
    release();
    await expect(firstCall).resolves.toEqual({ id: "one" });
  });

  it("a reused key with a different delegated account is rejected", async () => {
    const { db } = fixture();
    await ejecutarGooglePostUnaVez(db, spec, async () => ({ id: "one" }), serialize, restore);
    await expect(ejecutarGooglePostUnaVez(
      db, { ...spec, cuenta: "host-2" }, vi.fn(), serialize, restore
    )).rejects.toBeInstanceOf(GoogleOperacionInciertaError);
  });

  it("permite confirmar una operación incierta solo con un ID remoto verificado", async () => {
    const { db, operations } = fixture();
    operations.set(spec.clave, { ...spec, estado: "INCIERTA", intentos: 1 });
    expect(await confirmarGoogleOperacionVerificada(db, spec.clave, { id: "folder-confirmed" }))
      .toBe(true);
    expect(operations.get(spec.clave)).toMatchObject({
      estado: "CONFIRMADA", resultado: { id: "folder-confirmed" }
    });
    expect(await confirmarGoogleOperacionVerificada(db, spec.clave, { id: "other" }))
      .toBe(false);
  });

  it("no acepta evidencia de conciliación sin ID remoto", async () => {
    const { db } = fixture();
    await expect(confirmarGoogleOperacionVerificada(db, spec.clave, {}))
      .rejects.toThrow("ID válido");
  });

  it("does not persist credentials or raw request payloads", async () => {
    const { db, operations } = fixture();
    await ejecutarGooglePostUnaVez(db, spec, async () => ({ id: "remote-id" }), serialize, restore);
    const persisted = JSON.stringify([...operations.values()]);
    expect(persisted).not.toContain("privateKey");
    expect(persisted).not.toContain("accessToken");
  });
});
