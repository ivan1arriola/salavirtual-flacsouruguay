import { describe, expect, it } from "vitest";
import { construirHtmlResumenMonitoreo } from "../src/modules/asistencia/correo-monitoreo.domain";

const reunion = {
  fecha: "sáb., 24 oct.",
  titulo: "Seminario de <Investigación>",
  inicioMonitoreo: "09:45",
  finMonitoreo: "12:00",
  inicioClase: "10:00",
  finClase: "12:00",
  modalidad: "Virtual",
  programa: "Género & Sociedad",
  docente: "Florencia Quartino",
  meetUrl: "https://meet.google.com/abc-defg-hij"
};

describe("resúmenes HTML de monitoreo", () => {
  it("distingue monitoreo de clase, conserva datos y accesos en cada tarjeta asignada", () => {
    const html = construirHtmlResumenMonitoreo({
      variante: "asignadas",
      nombre: "Iván",
      reuniones: [reunion, { ...reunion, titulo: "Segundo encuentro", meetUrl: null }]
    });

    expect(html).toContain("Tus monitoreos asignados");
    expect(html).toContain("Tenés 2 reuniones asignadas.");
    expect(html).toContain("Hola, Iván.");
    expect(html).toContain("REUNIÓN 01");
    expect(html).toContain("REUNIÓN 02");
    expect(html).toContain("09:45–12:00 h");
    expect(html).toContain("Clase: 10:00–12:00 h");
    expect(html).toContain("Seminario de &lt;Investigación&gt;");
    expect(html).toContain("Género &amp; Sociedad");
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(html.match(/Ingresar a Google Meet/g)).toHaveLength(1);
    expect(html).toContain('href="https://salavirtual.flacso.edu.uy/mi-agenda"');
    expect(html).toContain("Administrar preferencias de notificación");
    expect(html).not.toContain("<Investigación>");
  });

  it("muestra las oportunidades sin entregar enlaces de reunión antes de asignar", () => {
    const html = construirHtmlResumenMonitoreo({
      variante: "disponibles",
      reuniones: [reunion]
    });

    expect(html).toContain("Hay 1 reunión disponible para postularte.");
    expect(html).toContain("Estas reuniones todavía no tienen una persona asignada.");
    expect(html).toContain('href="https://salavirtual.flacso.edu.uy/agenda-abierta"');
    expect(html).not.toContain("https://meet.google.com/abc-defg-hij");
    expect(html).not.toContain("Ingresar a Google Meet");
  });

  it("rechaza enlaces Meet de otros dominios y esquemas peligrosos", () => {
    const html = construirHtmlResumenMonitoreo({
      variante: "asignadas",
      reuniones: [
        { ...reunion, meetUrl: "javascript:alert(1)" },
        { ...reunion, meetUrl: "https://meet.google.com.ejemplo.com/abc" }
      ]
    });

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("meet.google.com.ejemplo.com");
    expect(html).not.toContain("Ingresar a Google Meet");
  });
});
