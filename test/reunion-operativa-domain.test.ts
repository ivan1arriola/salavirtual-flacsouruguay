import { describe, expect, it } from "vitest";
import {
  derivarEstadoGrabacionOperativa,
  derivarEstadoReunionOperativa,
  incidenciaOperativaSchema,
  puedeConsultarReunionOperativa
} from "../src/modules/reuniones/reunion-operativa.domain";

describe("reunión operativa", () => {
  const inicio = new Date("2026-09-23T18:00:00-03:00");
  const fin = new Date("2026-09-23T20:00:00-03:00");

  it("no declara EN_CURSO solo por haber llegado el horario", () => {
    expect(derivarEstadoReunionOperativa({
      ahora: new Date("2026-09-23T18:30:00-03:00"),
      inicio,
      fin,
      conferenciaInicio: null,
      conferenciaFin: null
    })).toBe("ESPERANDO_INICIO");
  });

  it("declara EN_CURSO únicamente con conferencia real iniciada", () => {
    expect(derivarEstadoReunionOperativa({
      ahora: new Date("2026-09-23T18:30:00-03:00"),
      inicio,
      fin,
      conferenciaInicio: new Date("2026-09-23T18:05:00-03:00"),
      conferenciaFin: null
    })).toBe("EN_CURSO");
  });

  it("distingue reunión finalizada y reunión nunca iniciada", () => {
    expect(derivarEstadoReunionOperativa({
      ahora: new Date("2026-09-23T20:15:00-03:00"),
      inicio,
      fin,
      conferenciaInicio: new Date("2026-09-23T18:05:00-03:00"),
      conferenciaFin: new Date("2026-09-23T20:03:00-03:00")
    })).toBe("FINALIZADA");

    expect(derivarEstadoReunionOperativa({
      ahora: new Date("2026-09-23T20:15:00-03:00"),
      inicio,
      fin,
      conferenciaInicio: null,
      conferenciaFin: null
    })).toBe("NO_INICIADA");
  });

  it("normaliza el estado operativo de la grabación", () => {
    expect(derivarEstadoGrabacionOperativa({
      requiereGrabacion: false,
      estadoReunion: "EN_CURSO",
      estadoProveedor: "AUSENTE"
    })).toBe("NO_REQUERIDA");
    expect(derivarEstadoGrabacionOperativa({
      requiereGrabacion: true,
      estadoReunion: "EN_CURSO",
      estadoProveedor: "PROCESANDO"
    })).toBe("PROCESANDO");
    expect(derivarEstadoGrabacionOperativa({
      requiereGrabacion: true,
      estadoReunion: "FINALIZADA",
      estadoProveedor: "GENERADA"
    })).toBe("DISPONIBLE");
    expect(derivarEstadoGrabacionOperativa({
      requiereGrabacion: true,
      estadoReunion: "FINALIZADA",
      estadoProveedor: "AUSENTE"
    })).toBe("NO_REALIZADA");
  });


  it("valida incidencias operativas estructuradas", () => {
    expect(incidenciaOperativaSchema.parse({
      tipo: "AUDIO_VIDEO",
      severidad: "ALTA",
      descripcion: "El docente no escucha a los participantes."
    })).toEqual({
      tipo: "AUDIO_VIDEO",
      severidad: "ALTA",
      descripcion: "El docente no escucha a los participantes."
    });

    expect(() => incidenciaOperativaSchema.parse({
      tipo: "DESCONOCIDA",
      severidad: "MEDIA",
      descripcion: "Problema."
    })).toThrow();

    expect(() => incidenciaOperativaSchema.parse({
      tipo: "OTRA",
      severidad: "MEDIA",
      descripcion: "x"
    })).toThrow();
  });

  it("reserva la consola a administración o al AT asignado", () => {
    expect(puedeConsultarReunionOperativa({
      rol: "ADMINISTRACION",
      asistenteAsignado: false
    })).toBe(true);
    expect(puedeConsultarReunionOperativa({
      rol: "ASISTENTE_TECNICO",
      asistenteAsignado: true
    })).toBe(true);
    expect(puedeConsultarReunionOperativa({
      rol: "ASISTENTE_TECNICO",
      asistenteAsignado: false
    })).toBe(false);
    expect(puedeConsultarReunionOperativa({
      rol: "DOCENTE",
      asistenteAsignado: false
    })).toBe(false);
  });
});
