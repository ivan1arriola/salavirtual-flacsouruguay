import { describe, expect, it } from "vitest";
import {
  asistenciaMeetCompleta,
  crearHtmlAsistencia,
  elegirConferenciaMeet,
  filtrarEncuentrosConArchivos,
  nombreArchivoReunion,
  nombreCarpetaReunion,
  obtenerAlcanceGrabaciones,
  puedeSincronizarGrabaciones,
  resolverEstadoVisualGrabacion,
  type GrupoEncuentroConArchivos,
  type RegistroConferenciaMeet
} from "@/src/modules/archivos/domain";

describe("archivos: domain", () => {
  describe("meet-artifacts.domain", () => {
    const baseDate = new Date("2026-09-19T14:00:00.000Z");

    it("genera el nombre de carpeta normalizado", () => {
      const folder = nombreCarpetaReunion({
        titulo: "Taller de Metodología / Módulo 1",
        inicio: baseDate,
        timezone: "America/Montevideo"
      });
      expect(folder).toContain("20260919 - Taller de Metodología - Módulo 1");
    });

    it("genera el nombre de archivo con formato seguro", () => {
      const filename = nombreArchivoReunion({
        titulo: "Clase Magistral",
        inicio: baseDate,
        timezone: "America/Montevideo",
        codigoReunion: "abc-defg-hij",
        tipo: "GRABACION",
        indice: 1,
        extension: "mp4"
      });
      expect(filename).toBe("20260919_abc-defg-hij_video_01_Clase-Magistral.mp4");
    });

    it("elige la conferencia superpuesta o más cercana", () => {
      const records: RegistroConferenciaMeet[] = [
        { name: "conf-early", startTime: "2026-09-19T10:00:00.000Z", endTime: "2026-09-19T11:00:00.000Z" },
        { name: "conf-target", startTime: "2026-09-19T13:55:00.000Z", endTime: "2026-09-19T15:05:00.000Z" },
        { name: "conf-late", startTime: "2026-09-19T16:00:00.000Z", endTime: "2026-09-19T17:00:00.000Z" }
      ];

      const selected = elegirConferenciaMeet(
        records,
        new Date("2026-09-19T14:00:00.000Z"),
        new Date("2026-09-19T15:00:00.000Z")
      );
      expect(selected?.name).toBe("conf-target");
    });

    it("detecta si la asistencia de Meet está completa", () => {
      expect(asistenciaMeetCompleta([])).toBe(false);
      expect(
        asistenciaMeetCompleta([
          [{ startTime: "2026-09-19T14:00:00Z", endTime: "2026-09-19T15:00:00Z" }]
        ])
      ).toBe(true);
      expect(
        asistenciaMeetCompleta([
          [{ startTime: "2026-09-19T14:00:00Z" }]
        ])
      ).toBe(false);
    });

    it("crea HTML de asistencia correctamente formateado", () => {
      const html = crearHtmlAsistencia([
        {
          nombre: "Docente Juan",
          tipo: "CUENTA_GOOGLE",
          inicio: "2026-09-19T14:00:00.000Z",
          fin: "2026-09-19T15:30:00.000Z"
        }
      ]);
      expect(html).toContain("Docente Juan");
      expect(html).toContain("CUENTA_GOOGLE");
      expect(html).toContain("90"); // minutos
    });
  });

  describe("grabaciones.domain", () => {
    it("resuelve el alcance de grabaciones según el rol", () => {
      expect(obtenerAlcanceGrabaciones("ADMINISTRACION")).toBe("COMPLETO");
      expect(obtenerAlcanceGrabaciones("DOCENTE")).toBe("PROGRAMAS_DOCENTE");
      expect(obtenerAlcanceGrabaciones("ASISTENTE_TECNICO")).toBe("ASIGNACIONES_ASISTENTE");
    });

    it("evalúa permisos de sincronización", () => {
      expect(puedeSincronizarGrabaciones("ADMINISTRACION")).toBe(true);
      expect(puedeSincronizarGrabaciones("DOCENTE")).toBe(true);
      expect(puedeSincronizarGrabaciones("ASISTENTE_TECNICO")).toBe(false);
    });
  });

  describe("grabaciones-filtro.domain", () => {
    const fin = new Date("2026-09-19T15:00:00.000Z");

    it("resuelve DISPONIBLE si existe archivo de grabación", () => {
      const estado = resolverEstadoVisualGrabacion({
        tieneArchivoGrabacion: true,
        archivosSincronizadosAt: null,
        finProgramadoAt: fin,
        requiereGrabacion: true,
        ahora: new Date("2026-09-19T16:00:00.000Z")
      });
      expect(estado).toBe("DISPONIBLE");
    });

    it("resuelve PROCESANDO si no sincronizó y pasaron menos de 4 horas", () => {
      const estado = resolverEstadoVisualGrabacion({
        tieneArchivoGrabacion: false,
        archivosSincronizadosAt: null,
        finProgramadoAt: fin,
        requiereGrabacion: true,
        ahora: new Date("2026-09-19T17:00:00.000Z") // 2 horas después
      });
      expect(estado).toBe("PROCESANDO");
    });

    it("resuelve NO_REGISTRADA si ya sincronizó o pasaron más de 4 horas y requería grabación", () => {
      const estado = resolverEstadoVisualGrabacion({
        tieneArchivoGrabacion: false,
        archivosSincronizadosAt: null,
        finProgramadoAt: fin,
        requiereGrabacion: true,
        ahora: new Date("2026-09-19T20:00:00.000Z") // 5 horas después
      });
      expect(estado).toBe("NO_REGISTRADA");
    });

    it("filtra encuentros por tipo de artefacto y texto de búsqueda", () => {
      const grupos: GrupoEncuentroConArchivos[] = [
        {
          instanciaId: "inst-1",
          titulo: "Seminario de Historia",
          programa: "Ciencias Sociales",
          docente: "Dra. Gómez",
          fechaInicio: "2026-09-19",
          archivos: [{ id: "a1", tipo: "GRABACION" }]
        },
        {
          instanciaId: "inst-2",
          titulo: "Taller de Redacción",
          programa: "Humanidades",
          docente: "Prof. Pérez",
          fechaInicio: "2026-09-20",
          archivos: [{ id: "a2", tipo: "LISTA_ASISTENCIA" }]
        }
      ];

      const soloGrabaciones = filtrarEncuentrosConArchivos(grupos, "GRABACIONES", "");
      expect(soloGrabaciones).toHaveLength(1);
      expect(soloGrabaciones[0].instanciaId).toBe("inst-1");

      const busquedaTexto = filtrarEncuentrosConArchivos(grupos, "TODOS", "redacción");
      expect(busquedaTexto).toHaveLength(1);
      expect(busquedaTexto[0].instanciaId).toBe("inst-2");
    });
  });
});

