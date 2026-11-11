import { describe, expect, it } from "vitest";
import {
  archivoBibliotecaZoom,
  etiquetaEstadoArchivoZoom,
  type ArchivoZoomBibliotecaFila
} from "../src/modules/archivos/domain";

function fila(over: Partial<ArchivoZoomBibliotecaFila> = {}): ArchivoZoomBibliotecaFila {
  return {
    id: "a1", tipoOriginal: "MP4", variante: "shared_screen_with_speaker_view", extension: "mp4",
    estado: "CONSERVADO", tamanoBytes: 1048576n, mimeType: "video/mp4", nombreDestino: "clase.mp4",
    webViewUrl: "https://drive.google.com/file/d/abc/view", errorCodigo: null, ...over
  };
}

describe("archivoBibliotecaZoom", () => {
  it("un MP4 conservado es una GRABACION con enlace a Drive", () => {
    const a = archivoBibliotecaZoom(fila());
    expect(a).toMatchObject({
      id: "a1", tipo: "GRABACION", etiqueta: "Video", nombre: "clase.mp4",
      enlace: "https://drive.google.com/file/d/abc/view", pendiente: false
    });
  });

  it("audios y chat quedan visibles con su etiqueta propia aunque su tipo Meet sea OTRO", () => {
    const audio = archivoBibliotecaZoom(fila({ tipoOriginal: "M4A", mimeType: "audio/mp4", nombreDestino: "audio.m4a" }));
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
    const a = archivoBibliotecaZoom(fila({ estado: "ERROR_REINTENTABLE", errorCodigo: "TOPE_DIARIO", webViewUrl: null }));
    expect(a).toMatchObject({ pendiente: true, errorCodigo: "TOPE_DIARIO", enlace: null });
  });

  it("todo estado tiene etiqueta legible", () => {
    for (const estado of ["DESCUBIERTO", "PROCESANDO_ORIGEN", "PENDIENTE", "COPIANDO", "CONSERVADO", "ERROR_REINTENTABLE", "REQUIERE_REVISION"] as const) {
      expect(etiquetaEstadoArchivoZoom(estado)).toBeTruthy();
    }
  });
});
