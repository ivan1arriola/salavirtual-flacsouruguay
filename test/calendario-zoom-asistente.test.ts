import { describe, expect, it } from "vitest";
import { eventoCoberturaZoom } from "@/src/modules/asistencia/domain/calendario-zoom.domain";

const baseUrl = "https://salavirtual.example";
const virtual = {
  id: "encuentro-1",
  proveedorActivoTipo: "ZOOM",
  eventosProveedor: [{ proveedor: { tipo: "GOOGLE_MEET" } }, { proveedor: { tipo: "ZOOM" } }],
  inicioProgramadoAt: new Date("2026-12-01T18:00:00Z"),
  finProgramadoAt: new Date("2026-12-01T20:00:00Z"),
  inicioAsistenciaTecnicaAt: null,
  finAsistenciaTecnicaAt: null,
  modalidadOverride: null,
  solicitud: { titulo: "Seminario", modalidad: "VIRTUAL" }
};

describe("evento de cobertura Zoom", () => {
  it("publica el horario de asistencia y un enlace que requiere sesión de Sala Virtual", () => {
    const evento = eventoCoberturaZoom(
      {
        ...virtual,
        modalidadOverride: "HIBRIDA",
        inicioAsistenciaTecnicaAt: new Date("2026-12-01T17:30:00Z"),
        finAsistenciaTecnicaAt: new Date("2026-12-01T20:30:00Z")
      },
      baseUrl
    );
    expect(evento?.data).toMatchObject({
      description: `Abrir la cobertura en Sala Virtual FLACSO: ${baseUrl}/operacion/encuentro-1`,
      start: { dateTime: "2026-12-01T17:30:00.000Z" },
      end: { dateTime: "2026-12-01T20:30:00.000Z" }
    });
  });

  it("conserva el identificador al reprogramar y cambia la huella de contenido", () => {
    const original = eventoCoberturaZoom(virtual, baseUrl);
    const editado = eventoCoberturaZoom(
      { ...virtual, finProgramadoAt: new Date("2026-12-01T21:00:00Z") },
      baseUrl
    );

    expect(original?.id).toMatch(/^[a-f0-9]{64}$/);
    expect(editado?.id).toBe(original?.id);
    expect(editado?.data.extendedProperties.private.flacsoHuella).not.toBe(
      original?.data.extendedProperties.private.flacsoHuella
    );
  });

  it("omite coberturas híbridas con horario pendiente y reuniones con Meet activo", () => {
    expect(eventoCoberturaZoom({ ...virtual, modalidadOverride: "HIBRIDA" }, baseUrl)).toBeNull();
    expect(eventoCoberturaZoom({ ...virtual, proveedorActivoTipo: "GOOGLE_MEET" }, baseUrl)).toBeNull();
    expect(eventoCoberturaZoom({ ...virtual, proveedorActivoTipo: null }, baseUrl)).toBeNull();
  });
});
