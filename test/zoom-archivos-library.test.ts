import { describe, expect, it } from "vitest";
import {
  categoriaArchivoZoom,
  enlaceArchivoZoom,
  etiquetaCategoriaZoom,
  filtrarArchivosZoomPorCategoria,
  respaldoCompletoZoom,
  resumirArchivosZoom,
  type ArchivoInventarioZoomVista
} from "../src/modules/archivos/domain";

function archivo(over: Partial<ArchivoInventarioZoomVista> = {}): ArchivoInventarioZoomVista {
  return {
    id: "a",
    tipoOriginal: "MP4",
    variante: "shared_screen_with_speaker_view",
    extension: "mp4",
    estado: "CONSERVADO",
    tamanoBytes: 100n,
    descargable: true,
    webViewUrl: "https://drive.google.com/file/d/abc/view",
    errorCodigo: null,
    ...over
  };
}

describe("categoriaArchivoZoom", () => {
  it("clasifica todas las variantes conocidas y manda lo desconocido a OTROS (nunca se oculta)", () => {
    const casos: Array<[string, string]> = [
      ["MP4", "VIDEO"],
      ["M4A", "AUDIO"],
      ["MP3", "AUDIO"],
      ["CHAT", "CHAT"],
      ["CC", "TRANSCRIPCION"],
      ["TRANSCRIPT", "TRANSCRIPCION"],
      ["AUDIO_TRANSCRIPT", "TRANSCRIPCION"],
      ["TIMELINE", "LINEA_DE_TIEMPO"],
      ["SUMMARY", "RESUMEN"],
      ["POLL", "OTROS"],
      ["ALGO_NUEVO", "OTROS"],
      ["mp4 ", "VIDEO"]
    ];
    for (const [tipo, categoria] of casos) {
      expect(categoriaArchivoZoom(tipo)).toBe(categoria);
    }
  });

  it("dos MP4 distintos (galería y pantalla) conservan su variante y siguen siendo VIDEO", () => {
    expect(categoriaArchivoZoom("MP4")).toBe("VIDEO");
    expect(etiquetaCategoriaZoom("VIDEO")).toBe("Video");
  });
});

describe("filtrarArchivosZoomPorCategoria", () => {
  const lista = [
    archivo({ id: "v" }),
    archivo({ id: "a", tipoOriginal: "M4A" }),
    archivo({ id: "c", tipoOriginal: "CHAT" }),
    archivo({ id: "x", tipoOriginal: "NUEVO" })
  ];
  it("TODOS incluye cada archivo, también OTROS", () => {
    expect(filtrarArchivosZoomPorCategoria(lista, "TODOS").map((a) => a.id)).toEqual(["v", "a", "c", "x"]);
  });
  it("una categoría solo trae sus archivos", () => {
    expect(filtrarArchivosZoomPorCategoria(lista, "AUDIO").map((a) => a.id)).toEqual(["a"]);
    expect(filtrarArchivosZoomPorCategoria(lista, "OTROS").map((a) => a.id)).toEqual(["x"]);
  });
});

describe("resumirArchivosZoom", () => {
  it("cuenta descubiertos, conservados, pendientes y en revisión", () => {
    const r = resumirArchivosZoom([
      archivo({ estado: "CONSERVADO" }),
      archivo({ estado: "PENDIENTE" }),
      archivo({ estado: "COPIANDO" }),
      archivo({ estado: "ERROR_REINTENTABLE", errorCodigo: "RED" }),
      archivo({ estado: "REQUIERE_REVISION" }),
      archivo({ estado: "DESCUBIERTO" }),
      archivo({ estado: "PROCESANDO_ORIGEN" })
    ]);
    expect(r).toMatchObject({ descubiertos: 7, conservados: 1, pendientes: 5, revision: 1, conError: 1 });
  });

  it("no suma bytes totales si algún tamaño se desconoce: lo declara", () => {
    const r = resumirArchivosZoom([archivo({ tamanoBytes: 10n }), archivo({ tamanoBytes: null })]);
    expect(r.bytesTotales).toBeNull();
    expect(r.bytesConocidos).toBe(10n);
    expect(r.tamanosDesconocidos).toBe(1);
  });

  it("con todos los tamaños conocidos suma el total", () => {
    const r = resumirArchivosZoom([archivo({ tamanoBytes: 10n }), archivo({ tamanoBytes: 5n })]);
    expect(r.bytesTotales).toBe(15n);
  });
});

describe("respaldoCompletoZoom", () => {
  it("un video conservado NO presenta el conjunto como respaldado si falta otro archivo", () => {
    expect(respaldoCompletoZoom([archivo(), archivo({ tipoOriginal: "CHAT", estado: "PENDIENTE" })])).toBe(
      false
    );
  });
  it("solo es completo si todos los descargables están conservados y no hay revisión", () => {
    expect(respaldoCompletoZoom([archivo(), archivo({ tipoOriginal: "CHAT" })])).toBe(true);
    expect(respaldoCompletoZoom([archivo(), archivo({ estado: "REQUIERE_REVISION" })])).toBe(false);
  });
  it("un recurso descubierto sin descarga disponible NO permite declarar respaldo completo; sin archivos tampoco", () => {
    expect(respaldoCompletoZoom([archivo(), archivo({ descargable: false, estado: "DESCUBIERTO" })])).toBe(
      false
    );
    expect(respaldoCompletoZoom([])).toBe(false);
  });
  it("un inventario con procesamiento pendiente en Zoom no es completo", () => {
    expect(respaldoCompletoZoom([archivo()], { procesamientoPendiente: true })).toBe(false);
  });
});

describe("enlaceArchivoZoom", () => {
  it("solo hay enlace para archivos conservados con URL de Drive https", () => {
    expect(enlaceArchivoZoom(archivo())).toBe("https://drive.google.com/file/d/abc/view");
    expect(enlaceArchivoZoom(archivo({ estado: "PENDIENTE" }))).toBeNull();
    expect(enlaceArchivoZoom(archivo({ webViewUrl: null }))).toBeNull();
  });
  it("rechaza esquemas peligrosos y hosts ajenos a Google", () => {
    expect(enlaceArchivoZoom(archivo({ webViewUrl: "javascript:alert(1)" }))).toBeNull();
    expect(enlaceArchivoZoom(archivo({ webViewUrl: "http://drive.google.com/file/d/abc" }))).toBeNull();
    expect(enlaceArchivoZoom(archivo({ webViewUrl: "https://evil.example/x" }))).toBeNull();
  });
});
