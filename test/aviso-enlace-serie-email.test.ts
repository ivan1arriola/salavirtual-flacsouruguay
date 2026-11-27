import { describe, expect, it } from "vitest";
import { construirAvisoEnlaceSerieZoom } from "../src/modules/reuniones/aviso-enlace-serie-email.domain";

const base = {
  nombre: "Carla",
  reunion: "Seminario <de> Investigación",
  programa: "Maestría & Doctorado",
  encuentros: [
    { fecha: "martes 10 de noviembre", horario: "10:00–12:00 h" },
    { fecha: "martes 17 de noviembre", horario: "10:00–12:00 h" },
    { fecha: "martes 24 de noviembre", horario: "10:00–12:00 h" },
  ],
  urlZoom: "https://flacso.zoom.us/j/123456789?pwd=abc",
  tipo: "MIGRACION_SERIE" as const,
};

describe("correo de cambio de enlace por serie", () => {
  it("lista todos los encuentros y el enlace único, en texto y en HTML", () => {
    const correo = construirAvisoEnlaceSerieZoom(base);
    for (const fecha of ["10 de noviembre", "17 de noviembre", "24 de noviembre"]) {
      expect(correo.text).toContain(fecha);
      expect(correo.html).toContain(fecha);
    }
    expect(correo.text).toContain("https://flacso.zoom.us/j/123456789?pwd=abc");
    expect(correo.html).toContain("https://flacso.zoom.us/j/123456789?pwd=abc");
    expect(correo.subject).toContain("Seminario <de> Investigación");
  });

  it("escapa el HTML del título y del programa", () => {
    const { html } = construirAvisoEnlaceSerieZoom(base);
    expect(html).toContain("Seminario &lt;de&gt; Investigación");
    expect(html).toContain("Maestría &amp; Doctorado");
    expect(html).not.toContain("<de>");
  });

  it("saluda por el nombre cuando se conoce y de forma genérica cuando no", () => {
    expect(construirAvisoEnlaceSerieZoom(base).text).toContain("Hola Carla,");
    expect(construirAvisoEnlaceSerieZoom({ ...base, nombre: null }).text).toContain("Hola,");
    expect(construirAvisoEnlaceSerieZoom({ ...base, nombre: "   " }).text).toContain("Hola,");
  });

  it("el texto cambia según el tipo de aviso", () => {
    const migracion = construirAvisoEnlaceSerieZoom(base);
    const correccion = construirAvisoEnlaceSerieZoom({ ...base, tipo: "CORRECCION_ENLACE" });
    expect(migracion.text).toContain("ahora es por Zoom");
    expect(correccion.text).toContain("cambió");
    expect(correccion.text).not.toContain("ahora es por Zoom");
    expect(migracion.subject).not.toBe(correccion.subject);
  });

  it("nunca incluye el enlace de inicio del anfitrión", () => {
    const correo = construirAvisoEnlaceSerieZoom(base);
    expect(`${correo.text}${correo.html}`).not.toMatch(/\/s\/\d+|zak=|start_url/);
  });
});
