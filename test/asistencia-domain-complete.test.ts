import { describe, expect, it } from "vitest";
import {
  buildAssignmentSuggestions,
  claveMesAnteriorUtc3,
  contarPostulacionesAbiertas,
  cumpleSeparacionMinimaAsistencias,
  esAsistenciaCompletada,
  estadoInteresParaAccion,
  evaluarConflictoAsistencia,
  evaluarDisponibilidad,
  formatTiempoRestante,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  resolverAccionHistorialAsistente,
  type AsignacionExistente,
  type AssignmentSuggestionInput,
  type PeriodoAsistencia
} from "@/src/modules/asistencia/domain";

describe("asistencia domain complete", () => {
  describe("permisos y reglas basicas", () => {
    it("valida permisos por rol", () => {
      expect(puedeGestionarPostulacion("ASISTENTE_TECNICO")).toBe(true);
      expect(puedeGestionarPostulacion("ADMINISTRACION")).toBe(false);

      expect(puedeAsignarAsistencia("ADMINISTRACION")).toBe(true);
      expect(puedeAsignarAsistencia("ASISTENTE_TECNICO")).toBe(false);
    });

    it("evalua separacion minima de 30 minutos entre asistencias", () => {
      const p1: PeriodoAsistencia = {
        inicio: new Date("2026-05-10T10:00:00Z"),
        fin: new Date("2026-05-10T11:00:00Z")
      };
      const p2Valido: PeriodoAsistencia = {
        inicio: new Date("2026-05-10T11:30:00Z"),
        fin: new Date("2026-05-10T12:30:00Z")
      };
      const p2Invalido: PeriodoAsistencia = {
        inicio: new Date("2026-05-10T11:20:00Z"),
        fin: new Date("2026-05-10T12:30:00Z")
      };

      expect(cumpleSeparacionMinimaAsistencias(p1, p2Valido)).toBe(true);
      expect(cumpleSeparacionMinimaAsistencias(p1, p2Invalido)).toBe(false);
    });

    it("mapea accion de postulacion a estado de interes", () => {
      expect(estadoInteresParaAccion("POSTULAR")).toBe("ME_INTERESA");
      expect(estadoInteresParaAccion("RETIRAR")).toBe("RETIRADO");
    });

    it("determina si una asistencia esta completada", () => {
      expect(esAsistenciaCompletada("FINALIZADA", 1000, 500)).toBe(true);
      expect(esAsistenciaCompletada("PROGRAMADA", 1000, 2000)).toBe(true);
      expect(esAsistenciaCompletada("PROGRAMADA", 2000, 1000)).toBe(false);
    });

    it("resuelve accion historial asistente", () => {
      expect(resolverAccionHistorialAsistente("ASISTENTE_ASIGNADO", null, "asist-1", "asist-1")).toBe(
        "ASIGNADO"
      );
      expect(resolverAccionHistorialAsistente("ASISTENTE_REASIGNADO", "asist-1", "asist-2", "asist-1")).toBe(
        "DESVINCULADO"
      );
      expect(resolverAccionHistorialAsistente("ASISTENTE_REASIGNADO", "asist-1", "asist-2", "asist-2")).toBe(
        "REASIGNADO"
      );
      expect(resolverAccionHistorialAsistente("ASISTENTE_DESVINCULADO", "asist-1", null, "asist-1")).toBe(
        "DESVINCULADO"
      );
      expect(resolverAccionHistorialAsistente("OTRO", null, null, "asist-1")).toBeNull();
    });
  });

  describe("evaluacion de conflicto y agenda abierta", () => {
    it("detecta superposicion directa como conflicto estricto", () => {
      const candidata: PeriodoAsistencia = {
        inicio: new Date("2026-05-10T10:00:00Z"),
        fin: new Date("2026-05-10T12:00:00Z")
      };
      const asignadas: readonly AsignacionExistente[] = [
        {
          id: "asig-1",
          titulo: "Clase previa",
          inicio: new Date("2026-05-10T11:00:00Z"),
          fin: new Date("2026-05-10T13:00:00Z")
        }
      ];

      const res = evaluarConflictoAsistencia(candidata, asignadas);
      expect(res.estado).toBe("CONFLICTO");
      expect(res.tone).toBe("red");
    });

    it("detecta proximidad menor a 30 min como muy proximo", () => {
      const candidata: PeriodoAsistencia = {
        inicio: new Date("2026-05-10T10:00:00Z"),
        fin: new Date("2026-05-10T11:00:00Z")
      };
      const asignadas: readonly AsignacionExistente[] = [
        {
          id: "asig-1",
          titulo: "Clase siguiente",
          inicio: new Date("2026-05-10T11:15:00Z"),
          fin: new Date("2026-05-10T12:15:00Z")
        }
      ];

      const res = evaluarConflictoAsistencia(candidata, asignadas);
      expect(res.estado).toBe("MUY_PROXIMO");
      expect(res.tone).toBe("amber");
    });

    it("devuelve disponible cuando hay suficiente margen", () => {
      const candidata: PeriodoAsistencia = {
        inicio: new Date("2026-05-10T10:00:00Z"),
        fin: new Date("2026-05-10T11:00:00Z")
      };
      const asignadas: readonly AsignacionExistente[] = [
        {
          id: "asig-1",
          titulo: "Clase tarde",
          inicio: new Date("2026-05-10T12:00:00Z"),
          fin: new Date("2026-05-10T13:00:00Z")
        }
      ];

      const res = evaluarConflictoAsistencia(candidata, asignadas);
      expect(res.estado).toBe("DISPONIBLE");
      expect(res.tone).toBe("green");
    });
  });

  describe("dashboard del asistente", () => {
    it("calcula mes anterior en UTC-3", () => {
      expect(claveMesAnteriorUtc3(new Date("2026-05-15T12:00:00Z"))).toBe("2026-04");
      expect(claveMesAnteriorUtc3(new Date("2026-01-15T12:00:00Z"))).toBe("2025-12");
    });

    it("formatea tiempo restante amigable", () => {
      const ahora = 1000 * 60 * 60;
      expect(formatTiempoRestante(ahora, ahora)).toBe("Ahora");
      expect(formatTiempoRestante(ahora + 15 * 60_000, ahora)).toBe("En 15 min");
      expect(formatTiempoRestante(ahora + 90 * 60_000, ahora)).toBe("En 1 h 30 min");
      expect(formatTiempoRestante(ahora + 26 * 60 * 60_000, ahora)).toBe("En 1 d 2 h");
    });

    it("cuenta postulaciones abiertas", () => {
      const abiertas = new Set(["inst-1", "inst-2"]);
      const postulaciones = [
        { instanciaSalaId: "inst-1", estado: "ME_INTERESA" as const },
        { instanciaSalaId: "inst-2", estado: "RETIRADO" as const },
        { instanciaSalaId: "inst-3", estado: "ME_INTERESA" as const }
      ];
      expect(contarPostulacionesAbiertas(abiertas, postulaciones)).toBe(1);
    });
  });

  describe("algoritmo de sugerencias y disponibilidad", () => {
    it("evalua disponibilidad preferente, disponible y no disponible", () => {
      const startsAt = new Date("2026-05-10T10:00:00Z");
      const endsAt = new Date("2026-05-10T11:00:00Z");

      const disponible = evaluarDisponibilidad(startsAt, endsAt, [
        {
          diaSemana: 0, // Domingo
          fecha: null,
          horaDesde: "09:00",
          horaHasta: "12:00",
          timezone: "UTC",
          tipo: "DISPONIBLE"
        }
      ]);
      expect(disponible.tipo).toBe("DISPONIBLE");

      const noDisponible = evaluarDisponibilidad(startsAt, endsAt, [
        {
          diaSemana: 0,
          fecha: null,
          horaDesde: "09:00",
          horaHasta: "12:00",
          timezone: "UTC",
          tipo: "NO_DISPONIBLE"
        }
      ]);
      expect(noDisponible.tipo).toBe("NO_DISPONIBLE");
    });

    it("construye sugerencias de asignacion excluyendo cesados", () => {
      const input: AssignmentSuggestionInput = {
        meetings: [
          {
            covered: false,
            meeting: {
              id: "m-1",
              inicioProgramadoAt: new Date("2026-05-10T10:00:00Z"),
              finProgramadoAt: new Date("2026-05-10T11:00:00Z"),
              timezone: "UTC",
              postulaciones: [{ asistenteTecnico: { id: "asist-cesado" } }]
            }
          }
        ],
        assistants: [
          { id: "asist-cesado", name: "Cesado", cesadoHastaProximoInicioSesion: true },
          { id: "asist-activo", name: "Activo" }
        ],
        assignments: []
      };

      const result = buildAssignmentSuggestions(input);
      expect(result.get("m-1")?.id).toBe("asist-activo");
    });
  });
});
