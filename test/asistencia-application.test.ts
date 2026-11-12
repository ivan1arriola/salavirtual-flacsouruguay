import { describe, expect, it, vi } from "vitest";
import {
  actualizarDisponibilidadUseCase,
  actualizarPostulacionUseCase,
  asignarAsistenteUseCase,
  consultarAsistenciasPersonalesUseCase,
  consultarHistorialAsistenteUseCase,
  consultarSlugAsistenteUseCase,
  desvincularAsistenteUseCase,
  renotificarAsistentesUseCase,
  reportarDuracionUseCase
} from "@/src/modules/asistencia/application";
import type { AsistenciaRepositoryPort } from "@/src/modules/asistencia/ports";

describe("asistencia application", () => {
  describe("actualizar postulacion", () => {
    it("falla si el actor no es asistente tecnico", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {};
      const actor = { id: "u-1", rol: "DOCENTE", activo: true };

      await expect(
        actualizarPostulacionUseCase({ repo: mockRepo as AsistenciaRepositoryPort }, actor, {
          instanciaSalaId: "inst-1",
          accion: "POSTULAR"
        })
      ).rejects.toThrow("Solo un asistente de monitoreo puede gestionar postulaciones.");
    });

    it("actualiza postulacion correctamente para asistente activo", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        obtenerPerfilAsistentePorUsuarioId: vi.fn().mockResolvedValue({
          id: "asist-1",
          usuarioId: "u-1",
          nombre: "Ana",
          email: "ana@flacso.edu.uy",
          activo: true,
          cesadoHastaProximoInicioSesion: false
        }),
        actualizarPostulacion: vi.fn().mockResolvedValue(undefined)
      };
      const actor = { id: "u-1", rol: "ASISTENTE_TECNICO", activo: true };

      const res = await actualizarPostulacionUseCase({ repo: mockRepo as AsistenciaRepositoryPort }, actor, {
        instanciaSalaId: "inst-1",
        accion: "POSTULAR",
        comentario: "Disponible"
      });

      expect(res.ok).toBe(true);
      expect(res.estado).toBe("ME_INTERESA");
      expect(mockRepo.actualizarPostulacion).toHaveBeenCalledWith({
        instanciaSalaId: "inst-1",
        asistenteTecnicoId: "asist-1",
        estado: "ME_INTERESA",
        comentario: "Disponible"
      });
    });
  });

  describe("asignar y desvincular", () => {
    it("asigna asistente cuando el actor es administracion", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        reservarYAsignarAsistente: vi.fn().mockResolvedValue({
          id: "asig-1",
          instanciaSalaId: "inst-1",
          asistenteTecnicoId: "asist-1",
          estado: "ASIGNADO",
          asistenteUsuarioId: "u-1",
          asistenteEmail: "ana@flacso.edu.uy",
          googleAccountIds: []
        })
      };
      const actor = { id: "admin-1", rol: "ADMINISTRACION", activo: true };

      const res = await asignarAsistenteUseCase({ repo: mockRepo as AsistenciaRepositoryPort }, actor, {
        instanciaSalaId: "inst-1",
        asistenteTecnicoId: "asist-1"
      });

      expect(res.id).toBe("asig-1");
      expect(mockRepo.reservarYAsignarAsistente).toHaveBeenCalledWith("inst-1", "asist-1", "admin-1");
    });

    it("desvincula asistente cuando el actor es administracion", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        desvincularAsistente: vi.fn().mockResolvedValue({
          id: "asig-1",
          instanciaSalaId: "inst-1",
          asistenteTecnicoId: "asist-1",
          estado: "CANCELADO",
          asistenteUsuarioId: "u-1",
          asistenteEmail: "ana@flacso.edu.uy",
          googleAccountIds: []
        })
      };
      const actor = { id: "admin-1", rol: "ADMINISTRACION", activo: true };

      const res = await desvincularAsistenteUseCase({ repo: mockRepo as AsistenciaRepositoryPort }, actor, {
        asignacionId: "asig-1"
      });

      expect(res.estado).toBe("CANCELADO");
      expect(mockRepo.desvincularAsistente).toHaveBeenCalledWith("asig-1", "admin-1");
    });

    it("permite al asistente de monitoreo solicitar su propia baja", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        desvincularAsistente: vi.fn().mockResolvedValue({
          id: "asig-1",
          instanciaSalaId: "inst-1",
          asistenteTecnicoId: "asist-1",
          estado: "CANCELADO",
          asistenteUsuarioId: "u-1",
          asistenteEmail: "ana@flacso.edu.uy",
          googleAccountIds: []
        })
      };
      const actor = { id: "u-1", rol: "ASISTENTE_TECNICO", activo: true };

      const res = await desvincularAsistenteUseCase({ repo: mockRepo as AsistenciaRepositoryPort }, actor, {
        asignacionId: "asig-1"
      });

      expect(res.estado).toBe("CANCELADO");
      expect(mockRepo.desvincularAsistente).toHaveBeenCalledWith("asig-1", "u-1");
    });

    it("rechaza la desvinculación para otros roles", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        desvincularAsistente: vi.fn()
      };

      await expect(
        desvincularAsistenteUseCase(
          { repo: mockRepo as AsistenciaRepositoryPort },
          { id: "doc-1", rol: "DOCENTE", activo: true },
          { asignacionId: "asig-1" }
        )
      ).rejects.toThrow("No tenés permisos para desvincular este monitoreo.");
      expect(mockRepo.desvincularAsistente).not.toHaveBeenCalled();
    });
  });

  describe("reportar duracion y disponibilidad", () => {
    it("reporta duracion correctamente", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        reportarDuracion: vi.fn().mockResolvedValue(undefined)
      };
      const actor = { id: "u-1", rol: "ASISTENTE_TECNICO", activo: true };

      const res = await reportarDuracionUseCase({ repo: mockRepo as AsistenciaRepositoryPort }, actor, {
        asignacionId: "asig-1",
        inicioReal: "2026-05-10T10:00:00Z",
        finReal: "2026-05-10T11:30:00Z",
        comentario: "Todo en orden"
      });

      expect(res.ok).toBe(true);
      expect(mockRepo.reportarDuracion).toHaveBeenCalled();
    });

    it("actualiza disponibilidad semanal", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        actualizarDisponibilidad: vi.fn().mockResolvedValue(undefined)
      };
      const actor = { id: "u-1", rol: "ASISTENTE_TECNICO", activo: true };

      const res = await actualizarDisponibilidadUseCase(
        { repo: mockRepo as AsistenciaRepositoryPort },
        actor,
        {
          disponibleGeneral: true,
          franjas: [{ diaSemana: 1, horaDesde: "09:00", horaHasta: "13:00", tipo: "DISPONIBLE" }]
        }
      );

      expect(res.ok).toBe(true);
      expect(mockRepo.actualizarDisponibilidad).toHaveBeenCalled();
    });
  });

  describe("renotificar y consultas", () => {
    it("renotifica a los asistentes disponibles", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        obtenerAsistentesParaNotificacion: vi.fn().mockResolvedValue({
          reunion: {
            id: "inst-1",
            titulo: "Taller Metodológico",
            inicio: new Date(),
            fin: new Date(),
            modalidad: "VIRTUAL"
          },
          destinatarios: ["u-1", "u-2"]
        })
      };
      const mockNotificar = vi.fn().mockResolvedValue(undefined);
      const actor = { id: "admin-1", rol: "ADMINISTRACION", activo: true };

      const res = await renotificarAsistentesUseCase(
        { repo: mockRepo as AsistenciaRepositoryPort, notificarUsuarios: mockNotificar },
        actor,
        { instanciaSalaId: "inst-1" }
      );

      expect(res.destinatariosCount).toBe(2);
      expect(mockNotificar).toHaveBeenCalled();
    });

    it("consulta asistencias personales, historial y slug", async () => {
      const mockRepo: Partial<AsistenciaRepositoryPort> = {
        obtenerAsistenciasPersonales: vi.fn().mockResolvedValue([]),
        obtenerHistorialAsistenteEnRango: vi.fn().mockResolvedValue([]),
        obtenerSlugAsistente: vi.fn().mockResolvedValue("ana-silva")
      };

      const asistencias = await consultarAsistenciasPersonalesUseCase(
        { repo: mockRepo as AsistenciaRepositoryPort },
        "u-1",
        "MES_ACTUAL"
      );
      expect(asistencias).toEqual([]);

      const historial = await consultarHistorialAsistenteUseCase(
        { repo: mockRepo as AsistenciaRepositoryPort },
        "u-1",
        new Date(),
        new Date()
      );
      expect(historial).toEqual([]);

      const slug = await consultarSlugAsistenteUseCase({ repo: mockRepo as AsistenciaRepositoryPort }, "u-1");
      expect(slug).toBe("ana-silva");
    });
  });
});
