/**
 * Integración de casos de uso (inventario → copia con caída y reanudación → histórico sin vínculo → vínculo
 * posterior sin nueva descarga → movimiento de carpeta) con un repositorio y un Drive EN MEMORIA con estado.
 * No prueba la capa Prisma: esa tiene sus propios tests contra PostgreSQL (solo CI).
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  inventariarZoomUseCase,
  moverCarpetasVinculadasZoomUseCase,
  resolverCarpetaDestinoZoom,
  transferirArchivoZoomUseCase,
  vincularOcurrenciaZoom
} from "../src/modules/archivos/application";
import type {
  ArchivoOrigenZoom,
  LeaseArchivoZoom,
  ReferenciaOcurrenciaZoom,
  ResultadoInventarioZoom
} from "../src/modules/archivos/domain";
import type { ArchivoReclamadoZoom, ZoomArchivoRepositoryPort } from "../src/modules/archivos/ports";

const KIB = 256 * 1024;
const GB = 1024n ** 3n;
const AHORA = new Date("2026-03-15T15:00:00Z");
const MAS_TARDE = new Date("2026-03-15T16:00:00Z");
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const REF: ReferenciaOcurrenciaZoom = {
  cuentaZoomId: "cuenta",
  uuid: "uuid/=1",
  meetingId: "123",
  anfitrionZoomId: "host",
  inicioRealAt: new Date("2026-03-15T14:00:00Z"),
  titulo: "Clase integrada"
};

function contenido(n: number, semilla: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    b[i] = (i * 31 + semilla) % 251;
  }
  return b;
}
const CONTENIDOS: Record<string, Uint8Array> = {
  mp4: contenido(2 * KIB + 90_000, 1), // 3 bloques de subida: 256 KiB, 256 KiB y el resto
  m4a: contenido(300_000, 2),
  chat: contenido(5_000, 3)
};
const recurso = (id: string, tipo: string, ext: string, clave: string): ArchivoOrigenZoom => ({
  claveOrigen: clave.padEnd(64, "0"),
  archivoZoomId: id,
  coleccion: "recording_files",
  tipoOriginal: tipo,
  variante: null,
  extension: ext,
  inicioAt: null,
  finAt: null,
  tamanoBytes: BigInt(CONTENIDOS[ext === "mp4" ? "mp4" : ext === "m4a" ? "m4a" : "chat"]!.byteLength),
  estadoOrigen: "completed",
  descargable: true
});
const INVENTARIO: ResultadoInventarioZoom = {
  recursos: [
    recurso("z-mp4", "MP4", "mp4", "a1"),
    recurso("z-m4a", "M4A", "m4a", "a2"),
    recurso("z-chat", "CHAT", "txt", "a3")
  ],
  observaciones: [],
  procesamientoPendiente: false
};
const claveContenido = (r: ArchivoOrigenZoom) =>
  r.extension === "mp4" ? "mp4" : r.extension === "m4a" ? "m4a" : "chat";

/* ----- Zoom falso: solo contenido; cuenta las aperturas por archivo ----- */
function zoomFalso() {
  const aperturas: Array<{ id: string; offset: bigint }> = [];
  return {
    aperturas,
    obtenerInventario: vi.fn(async () => INVENTARIO),
    abrirDescarga: vi.fn(async (_o: ReferenciaOcurrenciaZoom, r: ArchivoOrigenZoom, offset: bigint) => {
      aperturas.push({ id: r.archivoZoomId!, offset });
      const datos = CONTENIDOS[claveContenido(r)]!.subarray(Number(offset));
      return {
        tipo: "CONTENIDO" as const,
        contenido: (async function* () {
          for (let i = 0; i < datos.length; i += 64 * 1024) {
            yield datos.subarray(i, i + 64 * 1024);
          }
        })(),
        offsetOrigen: offset,
        totalBytes: BigInt(CONTENIDOS[claveContenido(r)]!.byteLength)
      };
    })
  };
}

/* ----- Drive falso en memoria con subida reanudable, carpetas y movimiento ----- */
function driveFalso(opciones: { fallarSegundoBloqueDe?: string } = {}) {
  const archivos = new Map<
    string,
    { chunks: Uint8Array[]; completo: boolean; carpeta: string; nombre: string; origen: string }
  >();
  const carpetas = new Map<string, { nombre: string; padre: string }>();
  const porClave = new Map<string, string>();
  let ids = 0;
  let fallosPendientes = opciones.fallarSegundoBloqueDe ? 1 : 0;
  const longitud = (id: string) => archivos.get(id)!.chunks.reduce((n, c) => n + c.byteLength, 0);
  const destino = (id: string) => ({
    id,
    nombre: archivos.get(id)!.nombre,
    tamanoBytes: BigInt(longitud(id)),
    mimeType: null,
    webViewUrl: `https://drive.google.com/file/d/${id}/view`
  });
  return {
    archivos,
    carpetas,
    moverCarpeta: vi.fn(async (id: string, nuevoPadre: string) => {
      const c = carpetas.get(id);
      if (!c) {
        return "NO_ENCONTRADO" as const;
      }
      if (c.padre === nuevoPadre) {
        return "YA_EN_DESTINO" as const;
      }
      c.padre = nuevoPadre;
      return "MOVIDA" as const;
    }),
    asegurarCarpeta: vi.fn(async (clave: string, nombre: string, padre: string) => {
      const existente = porClave.get(clave);
      if (existente) {
        return existente;
      }
      const id = `carpeta-${carpetas.size + 1}`;
      carpetas.set(id, { nombre, padre });
      porClave.set(clave, id);
      return id;
    }),
    generarId: vi.fn(async () => `drive-${++ids}`),
    iniciarSubida: vi.fn(
      async (d: { fileId: string; nombre: string; carpetaId: string }, origenKey: string) => {
        archivos.set(d.fileId, {
          chunks: [],
          completo: false,
          carpeta: d.carpetaId,
          nombre: d.nombre,
          origen: origenKey
        });
        return `sesion:${d.fileId}`;
      }
    ),
    consultarSubida: vi.fn(async (sesion: string) => {
      const id = sesion.slice("sesion:".length);
      return archivos.has(id)
        ? { estado: "PARCIAL" as const, bytesConfirmados: BigInt(longitud(id)) }
        : { estado: "VENCIDA" as const };
    }),
    subirBloque: vi.fn(
      async (sesion: string, offset: bigint, bytes: Uint8Array, _t: unknown, o?: { ultimo?: boolean }) => {
        const id = sesion.slice("sesion:".length);
        const a = archivos.get(id)!;
        if (BigInt(longitud(id)) !== offset) {
          throw new Error(`offset ${offset} != ${longitud(id)}`);
        }
        // Cae el worker/red justo en el 2.º bloque del archivo indicado, una sola vez (los bytes del bloque no llegan).
        if (fallosPendientes > 0 && a.nombre === opciones.fallarSegundoBloqueDe && offset === BigInt(KIB)) {
          fallosPendientes--;
          throw new Error("conexión cortada");
        }
        a.chunks.push(bytes.slice());
        if (o?.ultimo) {
          a.completo = true;
          return { estado: "COMPLETA" as const, destino: destino(id) };
        }
        return { estado: "PARCIAL" as const, bytesConfirmados: BigInt(longitud(id)) };
      }
    ),
    buscarConservado: vi.fn(async (origenKey: string, fileId: string | null) => {
      const hallados = [...archivos.entries()].filter(
        ([id, a]) => a.completo && (a.origen === origenKey || id === fileId)
      );
      return hallados.length === 0
        ? { tipo: "NINGUNO" as const }
        : { tipo: "UNO" as const, destino: destino(hallados[0]![0]) };
    }),
    verificarArchivo: vi.fn(async (id: string) => (archivos.get(id)?.completo ? destino(id) : null)),
    bytesDe: (id: string) => {
      const a = archivos.get(id)!;
      const r = new Uint8Array(longitud(id));
      let o = 0;
      for (const c of a.chunks) {
        r.set(c, o);
        o += c.byteLength;
      }
      return r;
    }
  };
}

/* ----- Repositorio en memoria con la semántica que usan los casos de uso ----- */
type FilaArchivo = ArchivoOrigenZoom & {
  id: string;
  ocurrenciaId: string;
  estado: string;
  intentos: number;
  version: number;
  proximoIntentoAt: Date | null;
  driveFileId: string | null;
  upload: string | null;
  bytesConfirmados: bigint;
  nombreDestino: string;
  webViewUrl: string | null;
};
function repoEnMemoria() {
  const ocurrencias = new Map<
    string,
    {
      id: string;
      ref: ReferenciaOcurrenciaZoom;
      eventoId: string | null;
      carpeta: string | null;
      carpetaVinculadaAt: Date | null;
    }
  >();
  const archivos = new Map<string, FilaArchivo>();
  const lease = (a: FilaArchivo): LeaseArchivoZoom => ({
    archivoId: a.id,
    version: a.version,
    venceAt: new Date(AHORA.getTime() + 300_000)
  });
  const vigente = (l: LeaseArchivoZoom) =>
    archivos.get(l.archivoId)?.version === l.version ? archivos.get(l.archivoId)! : null;
  const repo = {
    async guardarInventario(entrada: { referencia: ReferenciaOcurrenciaZoom }, inv: ResultadoInventarioZoom) {
      let o = [...ocurrencias.values()].find((x) => x.ref.uuid === entrada.referencia.uuid);
      if (!o) {
        o = {
          id: `oc-${ocurrencias.size + 1}`,
          ref: entrada.referencia,
          eventoId: null,
          carpeta: null,
          carpetaVinculadaAt: null
        };
        ocurrencias.set(o.id, o);
      }
      let nuevos = 0,
        actualizados = 0;
      for (const r of inv.recursos) {
        const previo = [...archivos.values()].find(
          (a) => a.ocurrenciaId === o.id && a.claveOrigen === r.claveOrigen
        );
        if (previo) {
          actualizados++;
          continue;
        } // un CONSERVADO nunca se reinicia por reinventario
        nuevos++;
        const id = `ar-${archivos.size + 1}`;
        archivos.set(id, {
          ...r,
          id,
          ocurrenciaId: o.id,
          estado: r.descargable ? "PENDIENTE" : "DESCUBIERTO",
          intentos: 0,
          version: 0,
          proximoIntentoAt: null,
          driveFileId: null,
          upload: null,
          bytesConfirmados: 0n,
          nombreDestino: `${r.tipoOriginal}-${id}.${r.extension}`,
          webViewUrl: null
        });
      }
      return { ocurrenciaId: o.id, nuevos, actualizados, requierenRevision: 0 };
    },
    async reclamarArchivo(ahora: Date) {
      const a = [...archivos.values()].find(
        (x) =>
          (x.estado === "PENDIENTE" || x.estado === "ERROR_REINTENTABLE") &&
          (!x.proximoIntentoAt || x.proximoIntentoAt <= ahora)
      );
      if (!a) {
        return null;
      }
      a.estado = "COPIANDO";
      a.version++;
      return lease(a);
    },
    async obtenerArchivoReclamado(l: LeaseArchivoZoom): Promise<ArchivoReclamadoZoom | null> {
      const a = vigente(l);
      if (!a) {
        return null;
      }
      const o = ocurrencias.get(a.ocurrenciaId)!;
      return {
        lease: l,
        ocurrenciaId: o.id,
        ocurrencia: o.ref,
        eventoProveedorId: o.eventoId,
        driveFolderId: o.carpeta,
        recurso: a,
        nombreDestino: a.nombreDestino,
        driveFileId: a.driveFileId,
        uploadSessionCifrada: a.upload,
        bytesConfirmados: a.bytesConfirmados,
        intentos: a.intentos
      };
    },
    async guardarProgreso(
      l: LeaseArchivoZoom,
      p: { bytesConfirmados?: bigint; uploadSessionCifrada?: string | null; driveFileId?: string | null }
    ) {
      const a = vigente(l);
      if (!a) {
        return false;
      }
      if (p.bytesConfirmados !== undefined) {
        a.bytesConfirmados = p.bytesConfirmados;
      }
      if (p.uploadSessionCifrada !== undefined) {
        a.upload = p.uploadSessionCifrada;
      }
      if (p.driveFileId !== undefined) {
        a.driveFileId = p.driveFileId;
      }
      return true;
    },
    async confirmarConservado(l: LeaseArchivoZoom, d: { id: string; webViewUrl: string | null }) {
      const a = vigente(l);
      if (!a) {
        return false;
      }
      a.estado = "CONSERVADO";
      a.driveFileId = d.id;
      a.webViewUrl = d.webViewUrl;
      return true;
    },
    async registrarFallo(l: LeaseArchivoZoom, f: { tipo: string; proximoIntentoAt: Date | null }) {
      const a = vigente(l);
      if (!a) {
        return false;
      }
      a.estado =
        f.tipo === "ESPERA"
          ? "PENDIENTE"
          : f.tipo === "REVISION"
            ? "REQUIERE_REVISION"
            : "ERROR_REINTENTABLE";
      if (f.tipo === "REINTENTABLE") {
        a.intentos++;
      }
      a.proximoIntentoAt = f.proximoIntentoAt;
      return true;
    },
    async reservarTransferencia(_l: LeaseArchivoZoom, s: { bytes: bigint }) {
      return { tipo: "RESERVADA" as const, reservaId: "r", bytesReservados: s.bytes };
    },
    async liberarReserva() {
      return true;
    },
    async guardarCarpetaOcurrencia(id: string, carpeta: string) {
      const o = ocurrencias.get(id)!;
      if (o.carpeta) {
        return false;
      }
      o.carpeta = carpeta;
      return true;
    },
    async vincularOcurrencia(id: string, eventoId: string) {
      const o = ocurrencias.get(id);
      if (!o) {
        return { tipo: "NO_ENCONTRADA" as const, recurso: "OCURRENCIA" as const };
      }
      if (o.eventoId) {
        return { tipo: "VINCULADA_A_OTRO" as const, eventoProveedorId: o.eventoId };
      }
      o.eventoId = eventoId;
      return {
        tipo: "VINCULADA" as const,
        referenciasCreadas: [...archivos.values()].filter(
          (a) => a.ocurrenciaId === id && a.estado === "CONSERVADO"
        ).length
      };
    },
    // Para el movimiento de carpetas (puerto propio del caso de uso).
    async listarCarpetasPorMover(limite: number) {
      return [...ocurrencias.values()]
        .filter((o) => o.eventoId && o.carpeta && !o.carpetaVinculadaAt)
        .slice(0, limite)
        .map((o) => ({
          ocurrenciaId: o.id,
          driveFolderId: o.carpeta!,
          referencia: { inicioRealAt: o.ref.inicioRealAt }
        }));
    },
    async marcarCarpetaVinculada(id: string, ahora: Date) {
      ocurrencias.get(id)!.carpetaVinculadaAt = ahora;
      return true;
    }
  };
  return { repo, ocurrencias, archivos };
}

const RAICES = { raizVinculados: "VINCULADOS", raizHistorico: "HISTORICO" };
const LIMITES = { topeBytes: 80n * GB, reservaRecienteBytes: 20n * GB, ventanaMs: 24 * 3600_000 };

async function vaciarCola(
  r: ReturnType<typeof repoEnMemoria>,
  origen: ReturnType<typeof zoomFalso>,
  drive: ReturnType<typeof driveFalso>,
  ahora: Date
) {
  const resultados: string[] = [];
  for (let l = await r.repo.reclamarArchivo(ahora); l; l = await r.repo.reclamarArchivo(ahora)) {
    const res = await transferirArchivoZoomUseCase(
      r.repo as unknown as ZoomArchivoRepositoryPort,
      origen as never,
      drive as never,
      l,
      new AbortController().signal,
      {
        ahora: () => ahora,
        limites: LIMITES,
        bloqueBytes: KIB,
        aleatorio: () => 0.5,
        heartbeatMs: 1_000_000,
        leaseMs: 300_000,
        resolverCarpeta: (archivo) => resolverCarpetaDestinoZoom(drive as never, hash, archivo, RAICES)
      }
    );
    resultados.push(res.tipo);
  }
  return resultados;
}

describe("integración de archivos Zoom (casos de uso con repositorio y Drive en memoria)", () => {
  it("inventario → copia con caída a mitad de un archivo → reanuda desde lo confirmado → bytes íntegros, sin duplicar en Drive", async () => {
    const r = repoEnMemoria();
    const origen = zoomFalso();
    const drive = driveFalso({ fallarSegundoBloqueDe: "MP4-ar-1.mp4" });

    const inv = await inventariarZoomUseCase(r.repo, origen as never, {
      referencia: REF,
      cuentaProveedorId: null,
      ahora: AHORA,
      corteDias: 90
    });
    expect(inv).toMatchObject({ tipo: "GUARDADO", resumen: { nuevos: 3 } });

    const primera = await vaciarCola(r, origen, drive, AHORA);
    // El MP4 cayó en su 2.º bloque (reintentable); los otros dos se conservaron.
    expect([...r.archivos.values()].map((a) => [a.tipoOriginal, a.estado]).sort()).toEqual([
      ["CHAT", "CONSERVADO"],
      ["M4A", "CONSERVADO"],
      ["MP4", "ERROR_REINTENTABLE"]
    ]);
    expect(primera.filter((t) => t === "FALLO").length).toBe(1);

    // Pasado el backoff se reintenta: Drive ya tenía el primer bloque, así que se reanuda desde ahí, no desde cero.
    await vaciarCola(r, origen, drive, MAS_TARDE);
    const mp4 = [...r.archivos.values()].find((a) => a.tipoOriginal === "MP4")!;
    expect(mp4.estado).toBe("CONSERVADO");
    const aperturasMp4 = origen.aperturas.filter((a) => a.id === "z-mp4");
    expect(aperturasMp4.map((a) => a.offset)).toEqual([0n, BigInt(KIB)]);
    expect(createHash("sha256").update(drive.bytesDe(mp4.driveFileId!)).digest("hex")).toBe(
      createHash("sha256").update(CONTENIDOS.mp4!).digest("hex")
    );
    // Un único archivo de Drive por recurso (3), todos completos.
    expect([...drive.archivos.values()].filter((a) => a.completo)).toHaveLength(3);
    expect(drive.archivos.size).toBe(3);
  });

  it("histórico sin vínculo: va a la carpeta de administración y, al vincular, no se descarga de nuevo y la carpeta pasa a vinculados con los mismos IDs", async () => {
    const r = repoEnMemoria();
    const origen = zoomFalso();
    const drive = driveFalso();
    await inventariarZoomUseCase(r.repo, origen as never, {
      referencia: REF,
      cuentaProveedorId: null,
      ahora: AHORA,
      corteDias: 90
    });
    await vaciarCola(r, origen, drive, AHORA);

    const oc = [...r.ocurrencias.values()][0]!;
    // Sin encuentro: la carpeta cuelga de la raíz HISTÓRICA (año/mes/ocurrencia), jamás de la de vinculados.
    const subir = (id: string): string[] => {
      const c = drive.carpetas.get(id);
      return c ? [c.nombre, ...subir(c.padre)] : [id];
    };
    expect(subir(oc.carpeta!).at(-1)).toBe("HISTORICO");
    expect(subir(oc.carpeta!).slice(1, 3)).toEqual(["03", "2026"]);
    const idsAntes = [...r.archivos.values()].map((a) => a.driveFileId).sort();
    const descargasAntes = origen.abrirDescarga.mock.calls.length;

    // Vínculo manual posterior.
    const vinculo = await vincularOcurrenciaZoom(
      { repo: r.repo as never },
      { id: "admin", rol: "ADMINISTRACION" },
      oc.id,
      "ev-1"
    );
    expect(vinculo).toEqual({ tipo: "VINCULADA", referenciasCreadas: 3 });
    // Nada que transferir: cero descargas nuevas.
    expect(await r.repo.reclamarArchivo(MAS_TARDE)).toBeNull();
    expect(origen.abrirDescarga.mock.calls.length).toBe(descargasAntes);

    // El worker mueve la carpeta (no copia): mismos IDs de archivo, nuevo padre bajo VINCULADOS/2026/03.
    const resumen = await moverCarpetasVinculadasZoomUseCase(
      {
        repo: r.repo,
        storage: drive as never,
        hash,
        raizVinculados: RAICES.raizVinculados,
        ahora: () => MAS_TARDE
      },
      { limite: 10 }
    );
    expect(resumen).toMatchObject({ movidas: 1, fallidas: 0 });
    expect(subir(oc.carpeta!).at(-1)).toBe("VINCULADOS");
    expect([...r.archivos.values()].map((a) => a.driveFileId).sort()).toEqual(idsAntes);
    // Idempotente: otro ciclo no vuelve a mover nada.
    const otra = await moverCarpetasVinculadasZoomUseCase(
      {
        repo: r.repo,
        storage: drive as never,
        hash,
        raizVinculados: RAICES.raizVinculados,
        ahora: () => MAS_TARDE
      },
      { limite: 10 }
    );
    expect(otra).toMatchObject({ movidas: 0, yaEnDestino: 0 });
  });

  it("reinventariar una ocurrencia ya conservada no reinicia sus archivos ni encola nada", async () => {
    const r = repoEnMemoria();
    const origen = zoomFalso();
    const drive = driveFalso();
    await inventariarZoomUseCase(r.repo, origen as never, {
      referencia: REF,
      cuentaProveedorId: null,
      ahora: AHORA,
      corteDias: 90
    });
    await vaciarCola(r, origen, drive, AHORA);
    const otra = await inventariarZoomUseCase(r.repo, origen as never, {
      referencia: REF,
      cuentaProveedorId: null,
      ahora: MAS_TARDE,
      corteDias: 90
    });
    expect(otra).toMatchObject({ tipo: "GUARDADO", resumen: { nuevos: 0, actualizados: 3 } });
    expect([...r.archivos.values()].every((a) => a.estado === "CONSERVADO")).toBe(true);
    expect(await r.repo.reclamarArchivo(MAS_TARDE)).toBeNull();
  });
});
