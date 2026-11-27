import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notificarUsuario: vi.fn(),
  notificarUsuarios: vi.fn(),
}));

vi.mock("@/src/modules/notificaciones/notificaciones.service", () => ({
  notificarUsuario: mocks.notificarUsuario,
  notificarUsuarios: mocks.notificarUsuarios,
}));

import {
  notificarReunionesAsignadas,
  renotificarReunionesSinAsignar,
} from "@/src/modules/asistencia/notificaciones-masivas.service";

describe("notificaciones-masivas.service", () => {
  const adminActor = { id: "admin-1", rol: "ADMINISTRACION" as const, activo: true };
  const docenteActor = { id: "doc-1", rol: "DOCENTE" as const, activo: true };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("renotificarReunionesSinAsignar", () => {
    it("bloquea usuarios que no sean administradores", async () => {
      const mockDb = {} as any;
      await expect(renotificarReunionesSinAsignar(mockDb, docenteActor)).rejects.toThrow(
        "Solo Administración puede renotificar reuniones sin asignar.",
      );
    });

    it("informa si no hay reuniones sin asignar", async () => {
      const mockDb = {
        instanciaSala: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const result = await renotificarReunionesSinAsignar(mockDb, adminActor);
      expect(result.reunionesCount).toBe(0);
      expect(result.message).toContain("No hay reuniones pendientes de asignación");
      expect(mocks.notificarUsuarios).not.toHaveBeenCalled();
    });

    it("notifica a todos los asistentes disponibles si hay reuniones sin asignar", async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const mockDb = {
        instanciaSala: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "inst-1",
              inicioProgramadoAt: futureDate,
              finProgramadoAt: new Date(futureDate.getTime() + 7200000),
              inicioAsistenciaTecnicaAt: futureDate,
              finAsistenciaTecnicaAt: new Date(futureDate.getTime() + 7200000),
              modalidadOverride: null,
              solicitud: {
                titulo: "Taller Metodológico",
                modalidad: "VIRTUAL",
                docentePrograma: {
                  programa: { nombre: "Maestría en Políticas" },
                  docente: {
                    usuario: { nombres: "Ana", apellidos: "García" },
                  },
                },
              },
            },
          ]),
        },
        asistenteTecnico: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "asistente-1",
              usuario: {
                id: "user-1",
                emailPrincipal: "asistente1@flacso.edu.uy",
                nombres: "Carlos",
                apellidos: "Pérez",
              },
            },
            {
              id: "asistente-2",
              usuario: {
                id: "user-2",
                emailPrincipal: "asistente2@flacso.edu.uy",
                nombres: "Lucía",
                apellidos: "Gómez",
              },
            },
          ]),
        },
        auditoria: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
      } as any;

      const result = await renotificarReunionesSinAsignar(mockDb, adminActor);
      expect(result.reunionesCount).toBe(1);
      expect(result.asistentesCount).toBe(2);
      expect(mocks.notificarUsuarios).toHaveBeenCalledWith(
        mockDb,
        [
          { usuarioId: "user-1", email: "asistente1@flacso.edu.uy" },
          { usuarioId: "user-2", email: "asistente2@flacso.edu.uy" },
        ],
        expect.objectContaining({
          tipo: "ASISTENCIA_REQUERIDA",
          emailSubject: expect.stringContaining("Cobertura de monitoreo"),
          href: "/agenda-abierta",
        }),
      );
      expect(mockDb.auditoria.create).toHaveBeenCalled();
    });
  });

  describe("notificarReunionesAsignadas", () => {
    it("bloquea usuarios que no sean administradores", async () => {
      const mockDb = {} as any;
      await expect(notificarReunionesAsignadas(mockDb, docenteActor)).rejects.toThrow(
        "Solo Administración puede notificar reuniones asignadas.",
      );
    });

    it("informa si no hay reuniones asignadas", async () => {
      const mockDb = {
        asignacionAsistenciaTecnica: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const result = await notificarReunionesAsignadas(mockDb, adminActor);
      expect(result.asignacionesCount).toBe(0);
      expect(result.message).toContain("No hay reuniones asignadas programadas");
      expect(mocks.notificarUsuario).not.toHaveBeenCalled();
    });

    it("notifica individualmente a cada asistente con su cronograma de asignaciones", async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const mockDb = {
        asignacionAsistenciaTecnica: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "asg-1",
              asistenteTecnico: {
                usuario: {
                  id: "user-1",
                  emailPrincipal: "asistente1@flacso.edu.uy",
                  nombres: "Carlos",
                  apellidos: "Pérez",
                },
              },
              instancia: {
                id: "inst-1",
                inicioProgramadoAt: futureDate,
                finProgramadoAt: new Date(futureDate.getTime() + 7200000),
                inicioAsistenciaTecnicaAt: futureDate,
                finAsistenciaTecnicaAt: new Date(futureDate.getTime() + 7200000),
                modalidadOverride: null,
                solicitud: {
                  titulo: "Seminario de Tesis",
                  modalidad: "VIRTUAL",
                  docentePrograma: {
                    programa: { nombre: "Doctorado" },
                    docente: {
                      usuario: { nombres: "Marta", apellidos: "Rodríguez" },
                    },
                  },
                },
                eventosProveedor: [
                  {
                    joinUrl: "https://meet.google.com/abc-defg-hij",
                    proveedor: { tipo: "GOOGLE_MEET" },
                  },
                ],
              },
            },
            {
              id: "asg-2",
              asistenteTecnico: {
                usuario: {
                  id: "user-1",
                  emailPrincipal: "asistente1@flacso.edu.uy",
                  nombres: "Carlos",
                  apellidos: "Pérez",
                },
              },
              instancia: {
                id: "inst-2",
                inicioProgramadoAt: new Date(futureDate.getTime() + 86400000),
                finProgramadoAt: new Date(futureDate.getTime() + 93600000),
                inicioAsistenciaTecnicaAt: null,
                finAsistenciaTecnicaAt: null,
                modalidadOverride: "HIBRIDA",
                solicitud: {
                  titulo: "Clase Práctica",
                  modalidad: "VIRTUAL",
                  docentePrograma: {
                    programa: { nombre: "Doctorado" },
                    docente: {
                      usuario: { nombres: "Marta", apellidos: "Rodríguez" },
                    },
                  },
                },
                eventosProveedor: [],
              },
            },
          ]),
        },
        auditoria: {
          create: vi.fn().mockResolvedValue({ id: "audit-2" }),
        },
      } as any;

      const result = await notificarReunionesAsignadas(mockDb, adminActor);
      expect(result.asignacionesCount).toBe(2);
      expect(result.asistentesCount).toBe(1);
      expect(mocks.notificarUsuario).toHaveBeenCalledTimes(1);
      expect(mocks.notificarUsuario).toHaveBeenCalledWith(
        mockDb,
        { usuarioId: "user-1", email: "asistente1@flacso.edu.uy" },
        expect.objectContaining({
          tipo: "ASISTENCIA_ASIGNACION",
          emailSubject: expect.stringContaining("Cronograma de monitoreo: 2 reuniones asignadas"),
          emailText: expect.stringContaining("https://meet.google.com/abc-defg-hij"),
          href: "/mi-agenda",
        }),
      );
      expect(mockDb.auditoria.create).toHaveBeenCalled();
    });
  });
});
