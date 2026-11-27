import { describe, expect, it, vi } from "vitest";
import {
  validarEventoAuditoria,
  crearRegistrarAuditoriaUseCase,
  crearPrismaAuditoriaAdapter,
  type AuditoriaRepository,
} from "@/src/modules/auditoria/api";

describe("modulo auditoria", () => {
  describe("dominio", () => {
    it("valida exitosamente un evento de auditoria valido", () => {
      const fecha = new Date("2026-09-19T12:00:00Z");
      const resultado = validarEventoAuditoria({
        accion: "CREAR_REUNION",
        entidadTipo: "SolicitudSala",
        entidadId: "sol-123",
        actorUsuarioId: "usr-456",
        timestamp: fecha,
        valorNuevo: { modo: "AUTOMATICO" },
      });

      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.accion).toBe("CREAR_REUNION");
        expect(resultado.value.entidadTipo).toBe("SolicitudSala");
        expect(resultado.value.entidadId).toBe("sol-123");
        expect(resultado.value.actorUsuarioId).toBe("usr-456");
        expect(resultado.value.timestamp).toBe(fecha);
      }
    });

    it("rechaza un evento con accion, entidadTipo o entidadId vacios", () => {
      const resultado = validarEventoAuditoria({
        accion: "",
        entidadTipo: "",
        entidadId: "",
        timestamp: new Date(),
      });

      expect(resultado.ok).toBe(false);
    });

    it("rechaza un evento con fecha invalida", () => {
      const resultado = validarEventoAuditoria({
        accion: "ACTUALIZAR",
        entidadTipo: "Usuario",
        entidadId: "usr-1",
        timestamp: new Date("fecha-invalida"),
      });

      expect(resultado.ok).toBe(false);
    });
  });

  describe("aplicacion", () => {
    it("registra el evento a traves del repositorio cuando los datos son validos", async () => {
      const mockRepo: AuditoriaRepository = {
        registrar: vi.fn().mockResolvedValue(undefined),
      };

      const useCase = crearRegistrarAuditoriaUseCase(mockRepo);
      const resultado = await useCase({
        accion: "ASIGNAR_HOST",
        entidadTipo: "InstanciaSala",
        entidadId: "inst-789",
        timestamp: new Date("2026-09-19T14:00:00Z"),
      });

      expect(resultado.ok).toBe(true);
      expect(mockRepo.registrar).toHaveBeenCalledOnce();
    });

    it("no invoca el repositorio si el evento no supera la validacion de dominio", async () => {
      const mockRepo: AuditoriaRepository = {
        registrar: vi.fn().mockResolvedValue(undefined),
      };

      const useCase = crearRegistrarAuditoriaUseCase(mockRepo);
      const resultado = await useCase({
        accion: "",
        entidadTipo: "InstanciaSala",
        entidadId: "inst-789",
        timestamp: new Date(),
      });

      expect(resultado.ok).toBe(false);
      expect(mockRepo.registrar).not.toHaveBeenCalled();
    });
  });

  describe("infraestructura prisma", () => {
    it("inserta el registro en el modelo Prisma Auditoria", async () => {
      const mockCreate = vi.fn().mockResolvedValue({ id: "aud-1" });
      const mockPrisma = {
        auditoria: {
          create: mockCreate,
        },
      } as any;

      const adapter = crearPrismaAuditoriaAdapter(mockPrisma);
      const fecha = new Date("2026-09-19T14:00:00Z");

      await adapter.registrar({
        accion: "ROL_CAMBIADO",
        entidadTipo: "Usuario",
        entidadId: "usr-1",
        actorUsuarioId: "admin-1",
        timestamp: fecha,
        valorAnterior: { rol: "DOCENTE" },
        valorNuevo: { rol: "ADMINISTRACION" },
        correlacionId: "corr-123",
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          accion: "ROL_CAMBIADO",
          entidadTipo: "Usuario",
          entidadId: "usr-1",
          actorUsuarioId: "admin-1",
          valorAnterior: { rol: "DOCENTE" },
          valorNuevo: { rol: "ADMINISTRACION" },
          correlacionId: "corr-123",
          createdAt: fecha,
        },
      });
    });
  });
});
