import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZoomInscriptos } from "../src/bootstrap/ui/reuniones/zoom-inscriptos";

const invitado = { id: "i1", nombre: "Ana Pérez", email: "ana@example.com" };
const participante = (email: string, estado: "EN_REUNION" | "EN_ESPERA" | "DESCONECTADO" | "DESCONOCIDO") => ({
  id: "p1",
  nombre: "Ana",
  email,
  ingreso: null,
  salida: null,
  estado,
  rol: "PARTICIPANTE" as const,
  motivoSalida: null,
  calidadAudio: null,
  calidadVideo: null,
  calidadPantalla: null,
  tipoConexion: null,
  tipoRed: null
});

describe("lista de personas inscriptas en la ficha operativa", () => {
  it("muestra las inscripciones y el estado cuando coincide el correo exacto", () => {
    const html = renderToStaticMarkup(
      createElement(ZoomInscriptos, {
        invitados: [invitado],
        asistenciaEnVivo: { estado: "DISPONIBLE", participantes: [participante("ANA@example.com", "EN_REUNION")] }
      })
    );
    expect(html).toContain("Personas inscriptas");
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("ana@example.com");
    expect(html).toContain("En reunión");
  });

  it("no afirma que el inscripto no asistió si Zoom no devuelve su correo", () => {
    const html = renderToStaticMarkup(
      createElement(ZoomInscriptos, {
        invitados: [invitado],
        asistenciaEnVivo: { estado: "DISPONIBLE", participantes: [] }
      })
    );
    expect(html).toContain("Sin coincidencia por correo en esta consulta");
    expect(html).toContain("no significa que la persona no haya participado");
  });

  it("distingue una consulta de Zoom no disponible", () => {
    const html = renderToStaticMarkup(
      createElement(ZoomInscriptos, {
        invitados: [invitado],
        asistenciaEnVivo: { estado: "NO_DISPONIBLE", motivo: "ERROR_API" }
      })
    );
    expect(html).toContain("Conexión no verificable");
  });

  it("informa cuando el encuentro no tiene invitados registrados", () => {
    const html = renderToStaticMarkup(
      createElement(ZoomInscriptos, {
        invitados: [],
        asistenciaEnVivo: { estado: "NO_DISPONIBLE", motivo: "SIN_DATOS" }
      })
    );
    expect(html).toContain("No hay personas inscriptas registradas");
  });
});
