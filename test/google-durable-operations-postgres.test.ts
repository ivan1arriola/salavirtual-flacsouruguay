import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  claveOperacionGoogle,
  confirmarOperacionDriveMarcada,
  ejecutarGooglePostUnaVez,
  GoogleCuentaOcupadaError,
  GoogleOperacionInciertaError,
} from "../src/modules/operaciones/google-operaciones-externas.service";

const enabled = process.env["MEET_HISTORY_DATABASE_TEST"] === "1";

describe.skipIf(!enabled)("Google: POST durable con PostgreSQL real", () => {
  const db = new PrismaClient();
  const secondWorker = new PrismaClient();
  const correlation = randomUUID();
  const account = "ci-" + correlation + "@example.test";
  const prefix = "ci-" + correlation;
  const keys: string[] = [];
  const spec = (suffix: string) => {
    const clave = claveOperacionGoogle("MEET_CREAR_ESPACIO", prefix, suffix);
    keys.push(clave);
    return {
      clave,
      proveedor: "MEET" as const,
      tipo: "MEET_CREAR_ESPACIO" as const,
      cuenta: account,
    };
  };
  const serialize = (result: { id: string }) => ({ id: result.id });
  const restore = (data: Record<string, string>) => ({ id: data["id"]! });

  beforeAll(() => {
    const url = new URL(process.env["DATABASE_URL"]!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/flacso_meet_history_ci"
    ) {
      throw new Error("No ejecutar pruebas F9/Google contra una base externa.");
    }
  });
  afterAll(async () => {
    await db.googleOperacionExterna.deleteMany({ where: { clave: { in: keys } } });
    await db.googleCuentaLease.deleteMany({ where: { clave: "MEET:" + account } });
    await Promise.all([db.$disconnect(), secondWorker.$disconnect()]);
  });

  it("reutiliza el mismo recurso confirmado entre conexiones diferentes", async () => {
    const input = spec("confirmed");
    const send = vi.fn().mockResolvedValue({ id: "spaces/ci-1" });
    const one = await ejecutarGooglePostUnaVez(db, input, send, serialize, restore);
    const two = await ejecutarGooglePostUnaVez(secondWorker, input, send, serialize, restore);
    expect(one).toEqual(two);
    expect(send).toHaveBeenCalledOnce();
    const row = await db.googleOperacionExterna.findUniqueOrThrow({
      where: { clave: input.clave },
    });
    expect(row.estado).toBe("CONFIRMADA");
    expect(row.intentos).toBe(1);
  });

  it("un timeout ambiguo queda INCIERTA y nunca repite el POST", async () => {
    const input = spec("unknown");
    const send = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      ejecutarGooglePostUnaVez(db, input, send, serialize, restore),
    ).rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    await expect(
      ejecutarGooglePostUnaVez(secondWorker, input, send, serialize, restore),
    ).rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    expect(send).toHaveBeenCalledOnce();
    expect(
      (
        await db.googleOperacionExterna.findUniqueOrThrow({
          where: { clave: input.clave },
        })
      ).estado,
    ).toBe("INCIERTA");
  });

  it("serializa escrituras concurrentes de una cuenta entre dos workers", async () => {
    const one = spec("lock-1");
    const two = spec("lock-2");
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let started!: () => void;
    const processing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const firstCall = ejecutarGooglePostUnaVez(
      db,
      one,
      async () => {
        started();
        await gate;
        return { id: "spaces/ci-2" };
      },
      serialize,
      restore,
    );
    try {
      await processing;
      const send2 = vi.fn();
      await expect(
        ejecutarGooglePostUnaVez(secondWorker, two, send2, serialize, restore),
      ).rejects.toBeInstanceOf(GoogleCuentaOcupadaError);
      expect(send2).not.toHaveBeenCalled();
    } finally {
      unblock();
      await firstCall;
    }
  });
  it("recupera ENVIANDO de Drive abandonado tras verificar el marcador remoto", async () => {
    const clave = claveOperacionGoogle("DRIVE_SUBIR_DOCUMENTO", prefix, "stale");
    keys.push(clave);
    await db.googleOperacionExterna.create({
      data: {
        clave,
        proveedor: "DRIVE",
        tipo: "DRIVE_SUBIR_DOCUMENTO",
        cuenta: account,
        estado: "ENVIANDO",
        iniciadaAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    expect(await confirmarOperacionDriveMarcada(secondWorker, clave, { id: "doc-verified" })).toBe(
      true,
    );
    expect(
      (
        await db.googleOperacionExterna.findUniqueOrThrow({
          where: { clave },
        })
      ).estado,
    ).toBe("CONFIRMADA");
    const send = vi.fn();
    await expect(
      ejecutarGooglePostUnaVez(
        db,
        {
          clave,
          proveedor: "DRIVE",
          tipo: "DRIVE_SUBIR_DOCUMENTO",
          cuenta: account,
        },
        send,
        serialize,
        restore,
      ),
    ).resolves.toEqual({ id: "doc-verified" });
    expect(send).not.toHaveBeenCalled();
  });

  it("no confirma ENVIANDO reciente ni operaciones Meet sin marcador Drive", async () => {
    const clave = claveOperacionGoogle("DRIVE_CREAR_CARPETA", prefix, "recent");
    keys.push(clave);
    await db.googleOperacionExterna.create({
      data: {
        clave,
        proveedor: "DRIVE",
        tipo: "DRIVE_CREAR_CARPETA",
        cuenta: account,
        estado: "ENVIANDO",
        iniciadaAt: new Date(),
      },
    });
    expect(await confirmarOperacionDriveMarcada(secondWorker, clave, { id: "wrong" })).toBe(false);
    expect(
      (
        await db.googleOperacionExterna.findUniqueOrThrow({
          where: { clave },
        })
      ).estado,
    ).toBe("ENVIANDO");
    const meet = spec("not-drive");
    await db.googleOperacionExterna.create({
      data: { ...meet, estado: "INCIERTA" },
    });
    expect(await confirmarOperacionDriveMarcada(secondWorker, meet.clave, { id: "wrong" })).toBe(
      false,
    );
  });
});
