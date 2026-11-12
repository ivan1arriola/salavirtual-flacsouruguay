import { describe, expect, it } from "vitest";
import { botonCorreo, envolverCorreo, panelCorreo } from "../src/lib/email/email-design-system";
import { construirCorreoNotificacion } from "../src/modules/notificaciones/notificacion-email.domain";
import { construirCorreoReporteMensual } from "../src/modules/liquidaciones/domain/reporte-mensual.domain";

describe("sistema de diseño de correos", () => {
  it("usa el mismo encabezado, ancho y pie accesible en todas las variantes", () => {
    for (const variante of ["informativo", "accion", "alerta", "seguridad", "reporte"] as const) {
      const html = envolverCorreo({
        categoria: "Actualización",
        titulo: "Detalle <importante>",
        resumen: "Información & próxima acción",
        contenidoHtml: panelCorreo("<p>Contenido conocido</p>"),
        variante,
        preferenciasUrl: "https://salavirtual.flacso.edu.uy/mi-perfil"
      });
      expect(html).toContain("FLACSO Uruguay");
      expect(html).toContain("max-width:600px");
      expect(html).toContain("Detalle &lt;importante&gt;");
      expect(html).toContain("Información &amp; próxima acción");
      expect(html).toContain("Administrar preferencias de notificación");
      expect(html).toContain("Contenido conocido");
      expect(html).not.toContain("<importante>");
    }
  });

  it("evita inyectar enlaces inseguros en botones", () => {
    expect(botonCorreo({ texto: "Ver", url: "javascript:alert(1)" })).toBe("");
    expect(botonCorreo({ texto: "Ver", url: "https://salavirtual.flacso.edu.uy/" })).toContain(
      'href="https://salavirtual.flacso.edu.uy/"'
    );
  });

  it("diferencia alertas, reuniones y asignaciones sin perder el detalle", () => {
    const base = "https://salavirtual.flacso.edu.uy";
    const alerta = construirCorreoNotificacion(
      {
        tipo: "HOST_NO_CONECTADO",
        titulo: "Alerta de Meet",
        cuerpo: "No se detectó al anfitrión.",
        href: "/reuniones/123"
      },
      base
    );
    expect(alerta.html).toContain("Alerta operativa");
    expect(alerta.html).toContain("No se detectó al anfitrión.");
    expect(alerta.html).toContain("Abrir Sala Virtual FLACSO");

    const reunion = construirCorreoNotificacion(
      {
        tipo: "REUNION_CREADA",
        titulo: "Reunión confirmada",
        cuerpo: "Tu clase está programada.",
        emailText: "DATOS DE LA REUNIÓN\nReunión: Clase 2\nPrograma: Seminario",
        href: "/reuniones/abc"
      },
      base
    );
    expect(reunion.html).toContain("Información de la reunión");
    expect(reunion.html).toContain("Clase 2");
    expect(reunion.text).toContain("Clase 2");
  });

  it("estandariza reportes mensuales sin alterar cifras", () => {
    const report = construirCorreoReporteMensual({
      nombre: "Ana <Pérez>",
      periodo: "2026-09",
      resumen: {
        reuniones: 4,
        minutosVirtuales: 130,
        minutosHibridos: 50,
        montoVirtual: 0,
        montoHibrido: 0,
        monto: 0
      }
    });
    expect(report.html).toContain("FLACSO Uruguay");
    expect(report.html).toContain("Tus horas de monitoreo");
    expect(report.html).toContain("Ana &lt;Pérez&gt;");
    expect(report.html).toContain("3 h");
    expect(report.html).toContain("4");
    expect(report.text).toContain("Reuniones: 4");
  });
});
