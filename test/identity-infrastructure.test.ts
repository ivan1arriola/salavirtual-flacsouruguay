import { describe, expect, it, vi } from "vitest";
import {
  crearPrismaIdentityAdapter,
  crearAsistenciaCalendarioDispatcher,
} from "@/src/modules/identity/infrastructure";

describe("identity infrastructure adapters", () => {
  describe("prisma-identity.adapter", () => {
    it("busca un usuario por id o email para login local", async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({
        id: "usr-admin",
        passwordHash: "$2a$10$hash",
        debeCambiarPassword: false,
        rol: "ADMINISTRACION",
        activo: true,
        fusionadoEnId: null,
        nombres: "Admin",
        apellidos: "FLACSO",
        emailPrincipal: "admin@flacso.edu.uy",
      });

      const mockDb = {
        usuario: {
          findUnique: mockFindUnique,
          findFirst: vi.fn(),
        },
        $transaction: vi.fn(),
      } as any;

      const adapter = crearPrismaIdentityAdapter(mockDb);
      const usuario = await adapter.buscarParaLoginLocal("usr-admin");

      expect(usuario?.id).toBe("usr-admin");
      expect(usuario?.nombre).toBe("Admin FLACSO");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: "usr-admin" },
        select: expect.any(Object),
      });
    });

    it("registra acceso y reactiva asistente tecnico si estaba cesado", async () => {
      const mockTx = {
        usuario: { update: vi.fn().mockResolvedValue({}) },
        asistenteTecnico: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        auditoria: { create: vi.fn().mockResolvedValue({}) },
      };

      const mockDb = {
        $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockTx)),
      } as any;

      const adapter = crearPrismaIdentityAdapter(mockDb);
      const fecha = new Date("2026-09-19T16:00:00Z");

      await adapter.registrarAcceso("asist-1", "credentials", fecha);

      expect(mockTx.usuario.update).toHaveBeenCalledWith({
        where: { id: "asist-1" },
        data: { ultimoAccesoAt: fecha, ultimoProveedor: "credentials" },
      });
      expect(mockTx.asistenteTecnico.updateMany).toHaveBeenCalledWith({
        where: {
          usuarioId: "asist-1",
          cesadoHastaProximoInicioSesion: true,
        },
        data: { cesadoHastaProximoInicioSesion: false },
      });
      expect(mockTx.auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accion: "ASISTENTE_TECNICO_REACTIVADO_POR_LOGIN",
        }),
      });
    });
  });

  describe("asistencia-calendario-dispatcher.adapter", () => {
    it("invoca la sincronizacion de calendario y captura fallos sin lanzar excepcion", async () => {
      const mockSincronizar = vi.fn().mockRejectedValue(new Error("Fallo de red simulado"));
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const dispatcher = crearAsistenciaCalendarioDispatcher({
        db: {} as any,
        descifrar: (v) => v,
        publicarEvento: vi.fn(),
        eliminarEvento: vi.fn(),
        sincronizarUsuario: mockSincronizar,
      });

      await expect(dispatcher.reconciliarCalendarioAsistente("asist-1")).resolves.not.toThrow();
      expect(mockSincronizar).toHaveBeenCalledWith(expect.any(Object), "asist-1");
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
