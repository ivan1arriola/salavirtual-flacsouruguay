import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import { RecordingsLibrary } from "../src/components/recordings-library";
import type { GrupoEncuentroConArchivos } from "../src/modules/archivos/presentation";

const CONTEOS = { todos: 1, grabaciones: 1, asistencias: 1, notas: 0, transcripciones: 0 };

function grupoZoom(over: Partial<GrupoEncuentroConArchivos> = {}): GrupoEncuentroConArchivos {
  return {
    instanciaId: "inst-z", titulo: "Clase de prueba", programa: "Programa", docente: "Ana P",
    fechaInicio: new Date("2026-11-09T10:00:00Z"), folderId: "carpeta-zoom", requiereGrabacion: true,
    estadoGrabacion: "DISPONIBLE", proveedor: "ZOOM",
    asistenciaHref: "/reuniones/sol-9/encuentros/inst-z/asistencia",
    archivos: [
      { id: "az1", tipo: "GRABACION", nombre: "clase.mp4", webViewUrl: "https://drive.google.com/file/d/x/view", tamanoBytes: 1048576, mimeType: "video/mp4", etiquetaZoom: "Video", pendienteZoom: false },
      { id: "az2", tipo: "OTRO", nombre: "audio.m4a", webViewUrl: null, tamanoBytes: null, mimeType: null, etiquetaZoom: "Audio", pendienteZoom: true, estadoZoomEtiqueta: "Pendiente de copia" },
      { id: "az3", tipo: "OTRO", nombre: "chat.txt", webViewUrl: null, tamanoBytes: 1, mimeType: "text/plain", etiquetaZoom: "Chat", pendienteZoom: true, estadoZoomEtiqueta: "Error, se reintentará", errorCodigo: "TOPE_DIARIO" }
    ],
    ...over
  };
}

function html(grupo: GrupoEncuentroConArchivos, esAdmin = false): string {
  return renderToStaticMarkup(createElement(RecordingsLibrary, {
    grupos: [grupo], pagina: 1, totalPaginas: 1, busqueda: "", filtro: "TODOS",
    conteos: CONTEOS, totalEncuentros: 1, esAdmin
  }));
}

describe("biblioteca de grabaciones con encuentros Zoom", () => {
  it("la tarjeta muestra el proveedor real en lugar del sello fijo de Google Meet", () => {
    expect(html(grupoZoom())).toContain(">Zoom<");
    expect(html(grupoZoom({ proveedor: "GOOGLE_MEET", asistenciaHref: null }))).toContain(">Google Meet<");
  });

  it("el video conservado enlaza a Drive; audio y chat aparecen con su etiqueta propia", () => {
    const h = html(grupoZoom());
    expect(h).toContain("https://drive.google.com/file/d/x/view");
    expect(h).toContain("Audio");
    expect(h).toContain("Chat");
    expect(h).toContain("audio.m4a");
  });

  it("un archivo pendiente muestra su estado y no es un enlace; el error muestra su código", () => {
    const h = html(grupoZoom());
    expect(h).toContain("Pendiente de copia");
    expect(h).toContain("TOPE_DIARIO");
    // Solo hay un enlace a archivos de Drive: el del video conservado.
    expect(h.match(/href="https:\/\/drive\.google\.com\/file/g) ?? []).toHaveLength(1);
  });

  it("la asistencia de Zoom enlaza a la ficha del encuentro", () => {
    const h = html(grupoZoom());
    expect(h).toContain('href="/reuniones/sol-9/encuentros/inst-z/asistencia"');
    expect(h).toContain("Ver asistencia");
  });

  it("las acciones de planillas de Meet no se ofrecen en encuentros Zoom ni siquiera a administración", () => {
    expect(html(grupoZoom(), true)).not.toContain("planilla Sheets");
    expect(html(grupoZoom({ proveedor: "GOOGLE_MEET", asistenciaHref: null }), true)).toContain("planilla Sheets");
  });

  it("la tarjeta Meet no cambia: sus archivos siguen enlazando como hasta ahora", () => {
    const h = html(grupoZoom({
      proveedor: "GOOGLE_MEET", asistenciaHref: null,
      archivos: [{ id: "drive-1", tipo: "GRABACION", nombre: "meet.mp4", webViewUrl: null, tamanoBytes: 5, mimeType: "video/mp4" }]
    }));
    expect(h).toContain("https://drive.google.com/open?id=drive-1");
  });

  it("agrupa en un bloque desplegable las pistas individuales cuando el encuentro Zoom supera los 6 archivos", () => {
    const archivos = [
      { id: "v1", tipo: "GRABACION" as const, nombre: "video.mp4", webViewUrl: "https://drive.google.com/file/d/v1/view", tamanoBytes: 100, mimeType: "video/mp4", etiquetaZoom: "Video", descripcionZoom: "Pantalla compartida con orador", secundarioZoom: false, pendienteZoom: false },
      { id: "a0", tipo: "OTRO" as const, nombre: "audio.m4a", webViewUrl: "https://drive.google.com/file/d/a0/view", tamanoBytes: 50, mimeType: "audio/mp4", etiquetaZoom: "Audio", descripcionZoom: "Audio general de la reunión", secundarioZoom: false, pendienteZoom: false },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `p${i}`, tipo: "OTRO" as const, nombre: `part-${i}.m4a`, webViewUrl: `https://drive.google.com/file/d/p${i}/view`,
        tamanoBytes: 10, mimeType: "audio/mp4", etiquetaZoom: "Audio", descripcionZoom: `Pista de participante · Persona ${i}`,
        secundarioZoom: true, pendienteZoom: false
      }))
    ];
    const h = html(grupoZoom({ archivos }));
    expect(h).toContain("Pantalla compartida con orador");
    expect(h).toContain("Pistas de audio individuales y archivos auxiliares (6)");
    expect(h).toContain("Pista de participante · Persona 0");
  });
});
