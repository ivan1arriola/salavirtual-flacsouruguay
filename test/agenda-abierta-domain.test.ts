import { describe, expect, it } from "vitest";
import {
  agruparPorFecha,
  evaluarConflictoAsistencia,
  formatearDiasRestantes,
  ordenarPostulantesParaAdministracion,
} from "../src/modules/asistencia/agenda-abierta.domain";

describe("agenda-abierta.domain", () => {
  describe("evaluarConflictoAsistencia", () => {
    it("detecta DISPONIBLE cuando no hay asignaciones", () => {
      const candidata = {
        inicio: new Date("2026-09-10T18:00:00Z"),
        fin: new Date("2026-09-10T20:00:00Z"),
      };
      const result = evaluarConflictoAsistencia(candidata, []);
      expect(result.estado).toBe("DISPONIBLE");
      expect(result.tone).toBe("green");
    });

    it("detecta DISPONIBLE cuando la separación es mayor o igual a 30 minutos", () => {
      const candidata = {
        inicio: new Date("2026-09-10T18:00:00Z"),
        fin: new Date("2026-09-10T20:00:00Z"),
      };
      const asignadas = [
        {
          id: "asig-1",
          titulo: "Clase previa",
          inicio: new Date("2026-09-10T15:00:00Z"),
          fin: new Date("2026-09-10T17:30:00Z"),
        },
      ];
      const result = evaluarConflictoAsistencia(candidata, asignadas);
      expect(result.estado).toBe("DISPONIBLE");
    });

    it("detecta CONFLICTO cuando hay superposición de horarios directa", () => {
      const candidata = {
        inicio: new Date("2026-09-10T18:00:00Z"),
        fin: new Date("2026-09-10T20:00:00Z"),
      };
      const asignadas = [
        {
          id: "asig-1",
          titulo: "Taller Solapado",
          inicio: new Date("2026-09-10T19:00:00Z"),
          fin: new Date("2026-09-10T21:00:00Z"),
        },
      ];
      const result = evaluarConflictoAsistencia(candidata, asignadas);
      expect(result.estado).toBe("CONFLICTO");
      expect(result.tone).toBe("red");
      if (result.estado === "CONFLICTO") {
        expect(result.detalle).toContain("Taller Solapado");
      }
    });

    it("detecta MUY_PROXIMO cuando la separación es menor a 30 minutos sin solapamiento", () => {
      const candidata = {
        inicio: new Date("2026-09-10T18:00:00Z"),
        fin: new Date("2026-09-10T20:00:00Z"),
      };
      const asignadas = [
        {
          id: "asig-1",
          titulo: "Clase Muy Cercana",
          inicio: new Date("2026-09-10T16:00:00Z"),
          fin: new Date("2026-09-10T17:45:00Z"),
        },
      ];
      const result = evaluarConflictoAsistencia(candidata, asignadas);
      expect(result.estado).toBe("MUY_PROXIMO");
      expect(result.tone).toBe("amber");
      if (result.estado === "MUY_PROXIMO") {
        expect(result.minutosSeparacion).toBe(15);
        expect(result.detalle).toContain("15 min");
        expect(result.detalle).toContain("Clase Muy Cercana");
      }
    });
  });

  describe("formatearDiasRestantes", () => {
    it("devuelve 'Hoy' para el mismo día en la zona horaria", () => {
      const ahora = new Date("2026-09-10T14:00:00Z");
      const fecha = new Date("2026-09-10T21:00:00Z");
      expect(formatearDiasRestantes(fecha, ahora, "America/Montevideo")).toBe("Hoy");
    });

    it("devuelve 'Mañana' para el día siguiente", () => {
      const ahora = new Date("2026-09-10T14:00:00Z");
      const fecha = new Date("2026-09-11T14:00:00Z");
      expect(formatearDiasRestantes(fecha, ahora, "America/Montevideo")).toBe("Mañana");
    });

    it("devuelve 'En 3 días' para 3 días hacia adelante", () => {
      const ahora = new Date("2026-09-10T14:00:00Z");
      const fecha = new Date("2026-09-13T14:00:00Z");
      expect(formatearDiasRestantes(fecha, ahora, "America/Montevideo")).toBe("En 3 días");
    });
  });

  describe("agruparPorFecha", () => {
    it("agrupa items que corresponden al mismo día", () => {
      const items = [
        { id: "1", inicioProgramadoAt: new Date("2026-09-10T14:00:00Z") },
        { id: "2", inicioProgramadoAt: new Date("2026-09-10T18:00:00Z") },
        { id: "3", inicioProgramadoAt: new Date("2026-09-11T12:00:00Z") },
      ];
      const grupos = agruparPorFecha(items, new Date("2026-09-10T10:00:00Z"), "America/Montevideo");
      expect(grupos).toHaveLength(2);
      expect(grupos[0].items).toHaveLength(2);
      expect(grupos[0].etiquetaRelativa).toBe("Hoy");
      expect(grupos[1].items).toHaveLength(1);
      expect(grupos[1].etiquetaRelativa).toBe("Mañana");
    });
  });

  describe("ordenarPostulantesParaAdministracion", () => {
    it("prioriza DISPONIBLE con menor carga sobre otros", () => {
      const postulantes = [
        {
          id: "3",
          name: "Carlos",
          estadoDisponibilidad: "CONFLICTO" as const,
          etiquetaDisponibilidad: "Conflicto",
          minutosMensuales: 0,
        },
        {
          id: "2",
          name: "Bruno",
          estadoDisponibilidad: "DISPONIBLE" as const,
          etiquetaDisponibilidad: "Disponible",
          minutosMensuales: 240,
        },
        {
          id: "1",
          name: "Ana",
          estadoDisponibilidad: "DISPONIBLE" as const,
          etiquetaDisponibilidad: "Disponible",
          minutosMensuales: 120,
        },
        {
          id: "4",
          name: "Daniela",
          estadoDisponibilidad: "MUY_PROXIMO" as const,
          etiquetaDisponibilidad: "Muy próximo",
          minutosMensuales: 60,
        },
      ];

      const ordenados = ordenarPostulantesParaAdministracion(postulantes);
      expect(ordenados.map((p) => p.name)).toEqual(["Ana", "Bruno", "Daniela", "Carlos"]);
    });
  });
});
