import { describe, expect, it } from "vitest";
import {
  clasificarTipoArchivoZoom,
  nombreArchivoZoom,
  normalizarInventarioZoom
} from "../src/modules/archivos/domain/zoom-archivos.domain";
import type { ArchivoOrigenZoom, ReferenciaOcurrenciaZoom } from "../src/modules/archivos/domain/zoom-archivos.types";

const hash = (texto: string) => `h(${texto})`;
const ocurrencia: ReferenciaOcurrenciaZoom = {
  cuentaZoomId: "cta-1", uuid: "uuid/ab==", meetingId: "123",
  anfitrionZoomId: "host-1", inicioRealAt: new Date("2026-03-05T14:00:00Z"), titulo: "Clase 1"
};
const base = {
  recording_start: "2026-03-05T14:00:00Z", recording_end: "2026-03-05T15:00:00Z",
  file_type: "MP4", file_extension: "MP4", file_size: 1234, status: "completed",
  download_url: "https://zoom.us/rec/download/OPACO1?access_token=secreto"
};

describe("normalizarInventarioZoom", () => {
  it("conserva tipos desconocidos como OTRO sin perder tipo original, variante ni extension", () => {
    const r = normalizarInventarioZoom(ocurrencia, {
      recording_files: [{ ...base, id: "f1", file_type: "HOLOGRAMA", file_extension: "holo", recording_type: "vista_x" }]
    }, hash);
    expect(r.recursos).toHaveLength(1);
    expect(r.recursos[0]).toMatchObject({ tipoOriginal: "HOLOGRAMA", variante: "vista_x", extension: "holo" });
    expect(clasificarTipoArchivoZoom("HOLOGRAMA")).toBe("OTRO");
    expect(clasificarTipoArchivoZoom("mp4")).toBe("MP4");
  });

  it("MP4 de galeria y de pantalla son archivos diferentes incluso sin ID", () => {
    const r = normalizarInventarioZoom(ocurrencia, {
      recording_files: [
        { ...base, recording_type: "gallery_view" },
        { ...base, recording_type: "shared_screen" }
      ]
    }, hash);
    expect(r.recursos).toHaveLength(2);
    expect(new Set(r.recursos.map((x) => x.claveOrigen)).size).toBe(2);
    expect(r.observaciones).toEqual([]);
  });

  it("recorre recording_files, participant_audio_files y otras colecciones", () => {
    const r = normalizarInventarioZoom(ocurrencia, {
      recording_files: [{ ...base, id: "a" }],
      participant_audio_files: [{ ...base, id: "b", file_type: "M4A", file_name: "Ana" }],
      otra_coleccion: [{ ...base, id: "c", file_type: "CHAT" }],
      host_id: "x", topic: "t"
    }, hash);
    expect(r.recursos.map((x) => [x.coleccion, x.archivoZoomId]).sort()).toEqual([
      ["otra_coleccion", "c"], ["participant_audio_files", "b"], ["recording_files", "a"]
    ]);
  });

  it("metadatos opcionales ausentes o invalidos no descartan el recurso", () => {
    const r = normalizarInventarioZoom(ocurrencia, {
      recording_files: [{ id: "f1", file_type: "CHAT", file_size: "grande", recording_start: "no-fecha" }]
    }, hash);
    expect(r.recursos).toHaveLength(1);
    expect(r.recursos[0]).toMatchObject({ archivoZoomId: "f1", tamanoBytes: null, inicioAt: null, finAt: null, descargable: false });
    expect(r.observaciones.length).toBeGreaterThan(0);
  });

  it("elementos que no son objetos quedan como observacion, no se descartan en silencio", () => {
    const r = normalizarInventarioZoom(ocurrencia, { recording_files: [null, 5, { ...base, id: "ok" }] }, hash);
    expect(r.recursos).toHaveLength(1);
    expect(r.observaciones.filter((o) => o.tipo === "ELEMENTO_INVALIDO")).toHaveLength(2);
  });

  it("respuesta vacia o no objeto no produce recursos", () => {
    expect(normalizarInventarioZoom(ocurrencia, null, hash).recursos).toEqual([]);
    expect(normalizarInventarioZoom(ocurrencia, {}, hash).recursos).toEqual([]);
  });

  it("no expone download_url ni tokens", () => {
    const r = normalizarInventarioZoom(ocurrencia, { recording_files: [{ ...base, id: "f1" }], download_access_token: "tok" }, hash);
    const texto = JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(texto).not.toContain("OPACO1");
    expect(texto).not.toContain("secreto");
    expect(texto).not.toContain("tok");
    expect(r.recursos[0]).toMatchObject({ descargable: true, tamanoBytes: 1234n, estadoOrigen: "completed" });
  });

  it("con ID la identidad no depende de tiempos, orden ni URL", () => {
    const a = normalizarInventarioZoom(ocurrencia, { recording_files: [{ ...base, id: "f1" }, { ...base, id: "f2" }] }, hash);
    const b = normalizarInventarioZoom(ocurrencia, {
      recording_files: [
        { ...base, id: "f2", download_url: "https://zoom.us/otro" },
        { ...base, id: "f1", recording_end: "", status: "processing" }
      ]
    }, hash);
    const clave = (r: typeof a, id: string) => r.recursos.find((x) => x.archivoZoomId === id)?.claveOrigen;
    expect(clave(a, "f1")).toBe(clave(b, "f1"));
    expect(clave(a, "f2")).toBe(clave(b, "f2"));
    expect(clave(a, "f1")).not.toBe(clave(a, "f2"));
  });

  it("la clave incluye cuenta y UUID de la ocurrencia", () => {
    const f = { recording_files: [{ ...base, id: "f1" }] };
    const a = normalizarInventarioZoom(ocurrencia, f, hash).recursos[0].claveOrigen;
    const b = normalizarInventarioZoom({ ...ocurrencia, uuid: "otro" }, f, hash).recursos[0].claveOrigen;
    const c = normalizarInventarioZoom({ ...ocurrencia, cuentaZoomId: "cta-2" }, f, hash).recursos[0].claveOrigen;
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("sin ID: el mismo archivo antes y despues de completarse produce una sola fila", () => {
    const sinId = { recording_start: base.recording_start, file_type: "MP4", file_extension: "MP4", recording_type: "gallery_view" };
    const antes = normalizarInventarioZoom(ocurrencia, {
      recording_files: [{ ...sinId, recording_end: "", status: "processing" }]
    }, hash);
    const despues = normalizarInventarioZoom(ocurrencia, {
      recording_files: [{ ...sinId, recording_end: base.recording_end, status: "completed", download_url: base.download_url, file_size: 9 }]
    }, hash);
    expect(antes.recursos).toEqual([]);
    expect(antes.procesamientoPendiente).toBe(true);
    expect(despues.procesamientoPendiente).toBe(false);
    expect(despues.recursos).toHaveLength(1);
    const otraConsulta = normalizarInventarioZoom(ocurrencia, {
      recording_files: [{ ...sinId, recording_end: base.recording_end, status: "completed", download_url: "https://zoom.us/rec/download/DISTINTO" }]
    }, hash);
    expect(otraConsulta.recursos[0].claveOrigen).toBe(despues.recursos[0].claveOrigen);
  });

  it("sin ID: cambios de orden no cambian identidad", () => {
    const x = { recording_start: base.recording_start, file_type: "MP4", recording_type: "gallery_view", status: "completed" };
    const y = { recording_start: base.recording_start, file_type: "MP4", recording_type: "shared_screen", status: "completed" };
    const a = normalizarInventarioZoom(ocurrencia, { recording_files: [x, y] }, hash);
    const b = normalizarInventarioZoom(ocurrencia, { recording_files: [y, x] }, hash);
    expect(a.recursos.map((r) => r.claveOrigen).sort()).toEqual(b.recursos.map((r) => r.claveOrigen).sort());
  });

  it("dos candidatos sin ID indistinguibles requieren revision con multiplicidad", () => {
    const x = { recording_start: base.recording_start, file_type: "MP4", recording_type: "gallery_view", status: "completed" };
    const r = normalizarInventarioZoom(ocurrencia, { recording_files: [x, { ...x }] }, hash);
    expect(r.recursos).toHaveLength(1);
    expect(r.observaciones).toEqual([
      expect.objectContaining({ tipo: "IDENTIDAD_AMBIGUA", claveOrigen: r.recursos[0].claveOrigen, multiplicidad: 2 })
    ]);
  });

  it("el mismo ID repetido no es ambiguo", () => {
    const r = normalizarInventarioZoom(ocurrencia, { recording_files: [{ ...base, id: "f1" }, { ...base, id: "f1" }] }, hash);
    expect(r.recursos).toHaveLength(1);
    expect(r.observaciones).toEqual([]);
  });

  it("un elemento con ID aun procesando se inventaria como no descargable", () => {
    const r = normalizarInventarioZoom(ocurrencia, { recording_files: [{ ...base, id: "f1", status: "processing", recording_end: "" }] }, hash);
    expect(r.recursos[0]).toMatchObject({ estadoOrigen: "processing", descargable: false, finAt: null });
  });
});

describe("nombreArchivoZoom", () => {
  const archivo = (extra: Partial<ArchivoOrigenZoom> = {}): ArchivoOrigenZoom => ({
    claveOrigen: "clave-1", archivoZoomId: "f1", coleccion: "recording_files", tipoOriginal: "MP4",
    variante: "gallery_view", extension: "mp4", inicioAt: null, finAt: null, tamanoBytes: null,
    estadoOrigen: "completed", descargable: true, ...extra
  });

  it("incluye fecha, tipo, variante, id estable y extension", () => {
    expect(nombreArchivoZoom(ocurrencia, archivo())).toBe("2026-03-05_MP4_gallery_view_f1.mp4");
  });

  it("neutraliza separadores de ruta y caracteres reservados conservando Unicode", () => {
    const n = nombreArchivoZoom(ocurrencia, archivo({ variante: "../Ñandú/éxito\\x:y*?", archivoZoomId: "a/b\\c" }));
    expect(n).not.toMatch(/[\\/:*?"<>|]/);
    expect(n).not.toContain("..");
    expect(n).toContain("Ñandú");
    expect(n.endsWith(".mp4")).toBe(true);
  });

  it("sin ID usa la clave de origen y distingue archivos", () => {
    const a = nombreArchivoZoom(ocurrencia, archivo({ archivoZoomId: null, claveOrigen: "k1", variante: "x" }));
    const b = nombreArchivoZoom(ocurrencia, archivo({ archivoZoomId: null, claveOrigen: "k2", variante: "x" }));
    expect(a).not.toBe(b);
  });

  it("acota la longitud y omite extension ausente", () => {
    const n = nombreArchivoZoom(ocurrencia, archivo({ variante: "v".repeat(500), extension: null }));
    expect(n.length).toBeLessThanOrEqual(200);
    expect(n).not.toMatch(/\.$/);
  });
});
