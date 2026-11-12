import { describe, expect, it } from "vitest";
import {
  archivoBibliotecaZoom,
  describirVarianteZoom,
  esArchivoSecundarioZoom,
  etiquetaEstadoArchivoZoom,
  type ArchivoZoomBibliotecaFila
} from "../src/modules/archivos/domain";

function fila(over: Partial<ArchivoZoomBibliotecaFila> = {}): ArchivoZoomBibliotecaFila {
  return {
    id: "a1",
    tipoOriginal: "MP4",
    variante: "shared_screen_with_speaker_view",
    extension: "mp4",
    estado: "CONSERVADO",
    tamanoBytes: 1048576n,
    mimeType: "video/mp4",
    nombreDestino: "clase.mp4",
    webViewUrl: "https://drive.google.com/file/d/abc/view",
    errorCodigo: null,
    ...over
  };
}

describe("archivoBibliotecaZoom", () => {
  it("un MP4 conservado es una GRABACION con enlace a Drive", () => {
    const a = archivoBibliotecaZoom(fila());
    expect(a).toMatchObject({
      id: "a1",
      tipo: "GRABACION",
      etiqueta: "Video",
      nombre: "clase.mp4",
      enlace: "https://drive.google.com/file/d/abc/view",
      pendiente: false
    });
  });

  it("audios y chat quedan visibles con su etiqueta propia aunque su tipo Meet sea OTRO", () => {
    const audio = archivoBibliotecaZoom(
      fila({ tipoOriginal: "M4A", mimeType: "audio/mp4", nombreDestino: "audio.m4a" })
    );
    expect(audio).toMatchObject({ tipo: "OTRO", etiqueta: "Audio" });
    const chat = archivoBibliotecaZoom(fila({ tipoOriginal: "CHAT", nombreDestino: "chat.txt" }));
    expect(chat).toMatchObject({ tipo: "OTRO", etiqueta: "Chat" });
  });

  it("transcripciones y resúmenes mantienen su tipo Meet para los filtros existentes", () => {
    expect(archivoBibliotecaZoom(fila({ tipoOriginal: "TRANSCRIPT" })).tipo).toBe("TRANSCRIPCION");
    expect(archivoBibliotecaZoom(fila({ tipoOriginal: "CC" })).tipo).toBe("TRANSCRIPCION");
    expect(archivoBibliotecaZoom(fila({ tipoOriginal: "SUMMARY" })).tipo).toBe("NOTAS");
  });

  it("un archivo sin conservar no tiene enlace: queda pendiente con la etiqueta de su estado", () => {
    const a = archivoBibliotecaZoom(fila({ estado: "COPIANDO", webViewUrl: null }));
    expect(a.enlace).toBeNull();
    expect(a.pendiente).toBe(true);
    expect(a.estadoEtiqueta).toBe("Copiando a Drive");
  });

  it("un conservado con URL fuera de Google tampoco enlaza (el enlace es seguro o no es)", () => {
    expect(archivoBibliotecaZoom(fila({ webViewUrl: "https://evil.example/x" })).enlace).toBeNull();
  });

  it("un error reintentable expone su código para diagnóstico sin volverse enlace", () => {
    const a = archivoBibliotecaZoom(
      fila({ estado: "ERROR_REINTENTABLE", errorCodigo: "TOPE_DIARIO", webViewUrl: null })
    );
    expect(a).toMatchObject({ pendiente: true, errorCodigo: "TOPE_DIARIO", enlace: null });
  });

  it("todo estado tiene etiqueta legible", () => {
    for (const estado of [
      "DESCUBIERTO",
      "PROCESANDO_ORIGEN",
      "PENDIENTE",
      "COPIANDO",
      "CONSERVADO",
      "ERROR_REINTENTABLE",
      "REQUIERE_REVISION"
    ] as const) {
      expect(etiquetaEstadoArchivoZoom(estado)).toBeTruthy();
    }
  });

  it("traduce variantes técnicas de Zoom y distingue pistas individuales de participante", () => {
    expect(describirVarianteZoom("shared_screen_with_speaker_view(CC)", "MP4")).toBe(
      "Pantalla compartida con orador (con subtítulos)"
    );
    expect(describirVarianteZoom("gallery_view", "MP4")).toBe("Vista de galería");
    expect(describirVarianteZoom("audio_only", "M4A")).toBe("Audio general de la reunión");
    expect(describirVarianteZoom("Audio only - Andrea Hadjez", "M4A")).toBe(
      "Pista de participante · Andrea Hadjez"
    );
    expect(describirVarianteZoom(null, "CHAT")).toBe("Chat de la reunión");
    expect(esArchivoSecundarioZoom({ tipoOriginal: "M4A", variante: "Audio only - Andrea Hadjez" })).toBe(
      true
    );
    expect(esArchivoSecundarioZoom({ tipoOriginal: "M4A", variante: "audio_only" })).toBe(false);
    expect(esArchivoSecundarioZoom({ tipoOriginal: "TIMELINE", variante: "timeline" })).toBe(true);
  });
});
