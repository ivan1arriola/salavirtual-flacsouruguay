import { describe, expect, it, vi } from "vitest";
import { crearPrismaAsistenciaRepositoryAdapter } from "@/src/modules/asistencia/infrastructure";

describe("asistencia infrastructure", () => {
  describe("prisma asistencia repository adapter", () => {
    it("obtiene perfil de asistente tecnico activo", async () => {
      const mockDb = {
        asistenteTecnico: {
          findUnique: vi.fn().mockResolvedValue({
            id: "asist-1",
            usuarioId: "u-1",
            cesadoHastaProximoInicioSesion: false,
            usuario: {
              activo: true,
              rol: "ASISTENTE_TECNICO",
              nombres: "Ana",
              apellidos: "Silva",
              emailPrincipal: "ana@flacso.edu.uy"
            }
          })
        }
      };

      const adapter = crearPrismaAsistenciaRepositoryAdapter(mockDb as any);
      const perfil = await adapter.obtenerPerfilAsistentePorUsuarioId("u-1");

      expect(perfil).toEqual({
        id: "asist-1",
        usuarioId: "u-1",
        nombre: "Ana Silva",
        email: "ana@flacso.edu.uy",
        activo: true,
        cesadoHastaProximoInicioSesion: false
      });
    });

    it("retorna null si el usuario no es asistente tecnico", async () => {
      const mockDb = {
        asistenteTecnico: {
          findUnique: vi.fn().mockResolvedValue({
            id: "asist-1",
            usuarioId: "u-1",
            usuario: { rol: "DOCENTE" }
          })
        }
      };

      const adapter = crearPrismaAsistenciaRepositoryAdapter(mockDb as any);
      const perfil = await adapter.obtenerPerfilAsistentePorUsuarioId("u-1");
      expect(perfil).toBeNull();
    });

    it("obtiene slug del asistente", async () => {
      const mockDb = {
        asistenteTecnico: {
          findUnique: vi.fn().mockResolvedValue({ slug: "ana-silva" })
        }
      };

      const adapter = crearPrismaAsistenciaRepositoryAdapter(mockDb as any);
      const slug = await adapter.obtenerSlugAsistente("u-1");
      expect(slug).toBe("ana-silva");
    });

    it("obtiene asistentes para notificacion de reunion abierta", async () => {
      const mockDb = {
        instanciaSala: {
          findUnique: vi.fn().mockResolvedValue({
            id: "inst-1",
            requiereAsistenciaTecnica: true,
            estado: "PROGRAMADA",
            inicioProgramadoAt: new Date("2026-05-10T10:00:00Z"),
            finProgramadoAt: new Date("2026-05-10T12:00:00Z"),
            solicitud: {
              titulo: "Seminario",
              modalidad: "VIRTUAL",
              docentePrograma: { docente: { usuario: { nombres: "Prof.", apellidos: "Gomez" } } }
            },
            asignaciones: []
          })
        },
        asistenteTecnico: {
          findMany: vi.fn().mockResolvedValue([
            { usuarioId: "u-1" },
            { usuarioId: "u-2" }
          ])
        }
      };

      const adapter = crearPrismaAsistenciaRepositoryAdapter(mockDb as any);
      const info = await adapter.obtenerAsistentesParaNotificacion("inst-1");

      expect(info.reunion.titulo).toBe("Seminario");
      expect(info.reunion.docenteNombre).toBe("Prof. Gomez");
      expect(info.destinatarios).toEqual(["u-1", "u-2"]);
    });
  });
});
