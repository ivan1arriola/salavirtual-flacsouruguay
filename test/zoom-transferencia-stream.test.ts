import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  TransferenciaZoomError,
  transferirStreamZoom,
  type SubidaBloqueZoom
} from "../src/modules/archivos/application/zoom-transferencia-stream";

const KIB = 256 * 1024;

async function* generar(total: number, tamanoChunk = 64 * 1024, onYield?: (acum: number) => void) {
  let enviado = 0;
  while (enviado < total) {
    const n = Math.min(tamanoChunk, total - enviado);
    const chunk = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      chunk[i] = (enviado + i) % 251;
    }
    enviado += n;
    onYield?.(enviado);
    yield chunk;
  }
}

function destinoFalso(opciones: { aceptaHasta?: (offset: bigint, len: number) => bigint } = {}) {
  const bloques: Array<{ offset: bigint; len: number; ultimo: boolean }> = [];
  const recibidos: Uint8Array[] = [];
  const subir: SubidaBloqueZoom = async (offset, bytes, { ultimo }) => {
    bloques.push({ offset, len: bytes.byteLength, ultimo });
    recibidos.push(bytes.slice());
    const fin = opciones.aceptaHasta?.(offset, bytes.byteLength) ?? offset + BigInt(bytes.byteLength);
    return ultimo ? { estado: "COMPLETA" } : { estado: "PARCIAL", bytesConfirmados: fin };
  };
  return { bloques, recibidos, subir };
}

describe("transferirStreamZoom", () => {
  it("si el origen termina antes del total conocido NO finaliza la subida (ORIGEN_INCOMPLETO)", async () => {
    const destino = destinoFalso();
    await expect(
      transferirStreamZoom({
        stream: generar(3 * KIB),
        offsetConfirmado: 0n,
        offsetOrigen: 0n,
        bloqueBytes: KIB,
        totalConocido: BigInt(5 * KIB),
        subirBloque: destino.subir
      })
    ).rejects.toMatchObject({ codigo: "ORIGEN_INCOMPLETO" });
    expect(destino.bloques.some((b) => b.ultimo)).toBe(false);
  });

  it("con total conocido que coincide con lo recibido finaliza normalmente", async () => {
    const destino = destinoFalso();
    const r = await transferirStreamZoom({
      stream: generar(3 * KIB),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: BigInt(3 * KIB),
      subirBloque: destino.subir
    });
    expect(r.bytesTotales).toBe(BigInt(3 * KIB));
    expect(destino.bloques.at(-1)?.ultimo).toBe(true);
  });

  it("memoria acotada: nunca retiene más de un bloque + 1 chunk de un archivo mucho mayor", async () => {
    const total = 40 * 1024 * 1024; // 40 MiB con bloques de 1 MiB
    const bloque = 4 * KIB;
    let producido = 0;
    let confirmado = 0;
    let maxRetenido = 0;
    const subir: SubidaBloqueZoom = async (offset, bytes, { ultimo }) => {
      confirmado += bytes.byteLength;
      return ultimo
        ? { estado: "COMPLETA" }
        : { estado: "PARCIAL", bytesConfirmados: offset + BigInt(bytes.byteLength) };
    };
    const r = await transferirStreamZoom({
      stream: generar(total, 64 * 1024, (acum) => {
        producido = acum;
        maxRetenido = Math.max(maxRetenido, producido - confirmado);
      }),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: bloque,
      totalConocido: BigInt(total),
      subirBloque: subir
    });
    expect(r.bytesTotales).toBe(BigInt(total));
    expect(maxRetenido).toBeLessThanOrEqual(bloque + 64 * 1024 + 1);
  });

  it("solo el último PUT es final; los intermedios son múltiplos de 256 KiB y el último puede ser menor", async () => {
    const d = destinoFalso();
    const total = 2 * KIB + 1000;
    const r = await transferirStreamZoom({
      stream: generar(total),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: BigInt(total),
      subirBloque: d.subir
    });
    expect(d.bloques.map((b) => [b.len, b.ultimo])).toEqual([
      [KIB, false],
      [KIB, false],
      [1000, true]
    ]);
    expect(r.bytesTotales).toBe(BigInt(total));
  });

  it("archivo múltiplo exacto del bloque: lectura adelantada marca el último bloque completo como final", async () => {
    const d = destinoFalso();
    await transferirStreamZoom({
      stream: generar(2 * KIB),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: BigInt(2 * KIB),
      subirBloque: d.subir
    });
    expect(d.bloques.map((b) => [b.len, b.ultimo])).toEqual([
      [KIB, false],
      [KIB, true]
    ]);
  });

  it("archivo de 0 bytes finaliza con un bloque vacío", async () => {
    const d = destinoFalso();
    const r = await transferirStreamZoom({
      stream: generar(0),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: 0n,
      subirBloque: d.subir
    });
    expect(d.bloques).toEqual([{ offset: 0n, len: 0, ultimo: true }]);
    expect(r.bytesTotales).toBe(0n);
  });

  it("tamaño desconocido: el fin se detecta al terminar el stream", async () => {
    const d = destinoFalso();
    const r = await transferirStreamZoom({
      stream: generar(KIB + 5),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: null,
      subirBloque: d.subir
    });
    expect(d.bloques.at(-1)).toEqual({ offset: BigInt(KIB), len: 5, ultimo: true });
    expect(r.bytesTotales).toBe(BigInt(KIB + 5));
  });

  it("reanuda en un offset arbitrario confirmado por Drive cuando Zoom respeta Range", async () => {
    const d = destinoFalso();
    const offset = 3 * KIB;
    const r = await transferirStreamZoom({
      stream: desde(generar(5 * KIB), offset),
      offsetConfirmado: BigInt(offset),
      offsetOrigen: BigInt(offset),
      bloqueBytes: KIB,
      totalConocido: BigInt(5 * KIB),
      subirBloque: d.subir
    });
    expect(d.bloques[0]!.offset).toBe(BigInt(offset));
    expect(r.bytesTotales).toBe(BigInt(5 * KIB));
    expect(r.bytesDescartados).toBe(0n);
    expect(r.sha256).toBeNull(); // no vio el prefijo: no puede afirmar un hash completo
  });

  it("Zoom ignora Range (200 desde 0): descarta de forma acotada el prefijo ya confirmado y nunca desplaza bytes", async () => {
    const d = destinoFalso();
    const offset = 3 * KIB;
    const completo = Buffer.concat([Buffer.from(await juntar(generar(5 * KIB)))]);
    const r = await transferirStreamZoom({
      stream: generar(5 * KIB),
      offsetConfirmado: BigInt(offset),
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: BigInt(5 * KIB),
      maxDescarteBytes: BigInt(10 * KIB),
      subirBloque: d.subir
    });
    expect(r.bytesDescartados).toBe(BigInt(offset));
    expect(d.bloques[0]!.offset).toBe(BigInt(offset));
    const subido = Buffer.concat(d.recibidos);
    expect(subido.equals(completo.subarray(offset))).toBe(true);
    expect(r.sha256).toBe(createHash("sha256").update(completo).digest("hex"));
  });

  it("si el prefijo a descartar supera el máximo, falla con REQUIERE_REVISION sin subir nada", async () => {
    const d = destinoFalso();
    const error = await transferirStreamZoom({
      stream: generar(5 * KIB),
      offsetConfirmado: BigInt(4 * KIB),
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: BigInt(5 * KIB),
      maxDescarteBytes: BigInt(KIB),
      subirBloque: d.subir
    }).catch((e) => e);
    expect(error).toBeInstanceOf(TransferenciaZoomError);
    expect(error.codigo).toBe("DESCARTE_EXCEDIDO");
    expect(d.bloques).toHaveLength(0);
  });

  it("si el origen empieza más allá del offset confirmado no sube nada (hueco)", async () => {
    const d = destinoFalso();
    const error = await transferirStreamZoom({
      stream: generar(KIB),
      offsetConfirmado: 0n,
      offsetOrigen: BigInt(KIB),
      bloqueBytes: KIB,
      totalConocido: null,
      subirBloque: d.subir
    }).catch((e) => e);
    expect(error.codigo).toBe("ORIGEN_DESALINEADO");
    expect(d.bloques).toHaveLength(0);
  });

  it("último ACK perdido: si Drive ya tiene todo y el stream queda vacío, finaliza con bloque vacío", async () => {
    const d = destinoFalso();
    const r = await transferirStreamZoom({
      stream: generar(0),
      offsetConfirmado: BigInt(2 * KIB),
      offsetOrigen: BigInt(2 * KIB),
      bloqueBytes: KIB,
      totalConocido: BigInt(2 * KIB),
      subirBloque: d.subir
    });
    expect(d.bloques).toEqual([{ offset: BigInt(2 * KIB), len: 0, ultimo: true }]);
    expect(r.bytesTotales).toBe(BigInt(2 * KIB));
  });

  it("Drive confirma menos de lo enviado: detiene la transferencia para reanudar desde el offset real", async () => {
    const d = destinoFalso({ aceptaHasta: (offset) => offset + BigInt(KIB / 2) });
    const error = await transferirStreamZoom({
      stream: generar(3 * KIB),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: BigInt(3 * KIB),
      subirBloque: d.subir
    }).catch((e) => e);
    expect(error.codigo).toBe("CONFIRMACION_PARCIAL");
    expect(error.bytesConfirmados).toBe(BigInt(KIB / 2));
  });

  it("la sesión vencida se propaga para reiniciar desde cero", async () => {
    const error = await transferirStreamZoom({
      stream: generar(2 * KIB),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: null,
      subirBloque: async () => ({ estado: "VENCIDA" })
    }).catch((e) => e);
    expect(error.codigo).toBe("SESION_VENCIDA");
  });

  it("la señal de aborto corta antes de subir otro bloque", async () => {
    const control = new AbortController();
    let llamadas = 0;
    const error = await transferirStreamZoom({
      stream: generar(10 * KIB),
      offsetConfirmado: 0n,
      offsetOrigen: 0n,
      bloqueBytes: KIB,
      totalConocido: null,
      signal: control.signal,
      subirBloque: async (offset, bytes) => {
        llamadas++;
        control.abort();
        return { estado: "PARCIAL", bytesConfirmados: offset + BigInt(bytes.byteLength) };
      }
    }).catch((e) => e);
    expect(error.codigo).toBe("ABORTADA");
    expect(llamadas).toBe(1);
  });

  it("rechaza un tamaño de bloque que no sea múltiplo de 256 KiB", async () => {
    await expect(
      transferirStreamZoom({
        stream: generar(10),
        offsetConfirmado: 0n,
        offsetOrigen: 0n,
        bloqueBytes: 1000,
        totalConocido: null,
        subirBloque: async () => ({ estado: "COMPLETA" })
      })
    ).rejects.toThrow(/256/);
  });
});

async function* desde(origen: AsyncIterable<Uint8Array>, offset: number) {
  let visto = 0;
  for await (const chunk of origen) {
    if (visto + chunk.byteLength <= offset) {
      visto += chunk.byteLength;
      continue;
    }
    yield chunk.subarray(Math.max(0, offset - visto));
    visto += chunk.byteLength;
  }
}

async function juntar(origen: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const partes: Uint8Array[] = [];
  for await (const c of origen) {
    partes.push(c);
  }
  return Buffer.concat(partes);
}
