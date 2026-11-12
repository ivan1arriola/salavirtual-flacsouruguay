import { describe, expect, it, vi } from "vitest";
import {
  intentarSincronizacionCalendarioAsistente,
  reconciliarCalendariosAsistentesUseCase,
  sincronizarCalendarioAsistenteInstanciaUseCase,
  sincronizarCalendariosAsistenteSolicitudUseCase,
  sincronizarCalendariosAsistenteUsuarioUseCase
} from "../src/modules/asistencia/application";
import type {
  AssistantCalendarProvider,
  AssistantCalendarRepositoryPort,
  InstanciaParaCalendario
} from "../src/modules/asistencia/ports";

const linkedAccount = {
  id: "google-1",
  email: "asistente@flacso.edu.uy",
  dominio: "flacso.edu.uy",
  providerAccountId: "subject-1",
  emailVerificadoAt: new Date("2026-09-01T12:00:00Z")
};

function createMockInstance(overrides: Partial<InstanciaParaCalendario> = {}): InstanciaParaCalendario {
  return {
    id: "instancia-1",
    estado: "PROGRAMADA",
    requiereAsistenciaTecnica: true,
    inicioProgramadoAt: new Date("2026-10-01T18:00:00Z"),
    finProgramadoAt: new Date("2026-10-01T20:00:00Z"),
    inicioAsistenciaTecnicaAt: new Date("2026-10-01T17:00:00Z"),
    finAsistenciaTecnicaAt: new Date("2026-10-01T20:30:00Z"),
    modalidad: "HIBRIDA",
    timezone: "America/Montevideo",
    descripcion: "Clase 1",
    solicitudTitulo: "Seminario Virtual",
    solicitudDescripcion: "Descripción solicitud",
    programaNombre: "Maestría",
    docenteNombreCompleto: "Docente FLACSO",
    joinUrl: "https://meet.google.com/abc-defg-hij",
    asignaciones: [
      {
        id: "asig-1",
        estado: "ASIGNADO",
        asistenteTecnico: {
          usuario: {
            rol: "ASISTENTE_TECNICO",
            activo: true,
            fusionadoEnId: null,
            cuentasGoogle: [linkedAccount]
          }
        }
      }
    ],
    ...overrides
  };
}

describe("casos de uso de calendario de asistentes", () => {
  it("retorna vacio si la instancia no existe", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(null),
      obtenerInstanciasDeSolicitud: vi.fn(),
      obtenerInstanciasDeAsistente: vi.fn(),
      obtenerInstanciasFuturasParaReconciliar: vi.fn(),
      obtenerCredencialesWorkspace: vi.fn()
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn(),
      eliminarEvento: vi.fn()
    };

    const results = await sincronizarCalendarioAsistenteInstanciaUseCase(repository, provider, "no-existe");
    expect(results).toEqual([]);
    expect(provider.publicarEvento).not.toHaveBeenCalled();
  });

  it("retorna error de configuracion si no hay credenciales de Workspace", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(createMockInstance()),
      obtenerInstanciasDeSolicitud: vi.fn(),
      obtenerInstanciasDeAsistente: vi.fn(),
      obtenerInstanciasFuturasParaReconciliar: vi.fn(),
      obtenerCredencialesWorkspace: vi.fn().mockResolvedValue(null)
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn(),
      eliminarEvento: vi.fn()
    };

    const results = await sincronizarCalendarioAsistenteInstanciaUseCase(
      repository,
      provider,
      "instancia-1",
      new Date("2026-09-01T00:00:00Z")
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.estado).toBe("ERROR");
    expect(results[0]?.error).toContain("Google Workspace no está configurado");
  });

  it("publica evento en Google Calendar si las credenciales son validas", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(createMockInstance()),
      obtenerInstanciasDeSolicitud: vi.fn(),
      obtenerInstanciasDeAsistente: vi.fn(),
      obtenerInstanciasFuturasParaReconciliar: vi.fn(),
      obtenerCredencialesWorkspace: vi.fn().mockResolvedValue({
        serviceAccountEmail: "sa@flacso.edu.uy",
        privateKey: "pk-123"
      })
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn().mockResolvedValue(undefined),
      eliminarEvento: vi.fn().mockResolvedValue(undefined)
    };

    const results = await sincronizarCalendarioAsistenteInstanciaUseCase(
      repository,
      provider,
      "instancia-1",
      new Date("2026-09-01T00:00:00Z")
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.estado).toBe("SINCRONIZADA");
    expect(results[0]?.accion).toBe("PUBLICAR");
    expect(provider.publicarEvento).toHaveBeenCalledTimes(2);
    expect(provider.publicarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "asistente@flacso.edu.uy" }),
      expect.objectContaining({
        instanciaSalaId: "instancia-1",
        tipo: "PREPARACION",
        titulo: "Preparación técnica presencial · Seminario Virtual",
        inicio: new Date("2026-10-01T17:00:00Z"),
        fin: new Date("2026-10-01T18:00:00Z"),
        reunionInicio: new Date("2026-10-01T18:00:00Z"),
        reunionFin: new Date("2026-10-01T20:00:00Z"),
        modalidad: "HIBRIDA",
        joinUrl: null
      })
    );
    expect(provider.publicarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "asistente@flacso.edu.uy" }),
      expect.objectContaining({
        instanciaSalaId: "instancia-1",
        tipo: "CIERRE",
        titulo: "Cierre técnico presencial · Seminario Virtual",
        inicio: new Date("2026-10-01T20:00:00Z"),
        fin: new Date("2026-10-01T20:30:00Z"),
        modalidad: "HIBRIDA",
        joinUrl: null
      })
    );
    expect(provider.eliminarEvento).toHaveBeenCalledTimes(1);
  });

  it("en virtual no crea un bloque técnico duplicado del Meet", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(
        createMockInstance({
          modalidad: "VIRTUAL",
          inicioAsistenciaTecnicaAt: null,
          finAsistenciaTecnicaAt: null
        })
      ),
      obtenerInstanciasDeSolicitud: vi.fn(),
      obtenerInstanciasDeAsistente: vi.fn(),
      obtenerInstanciasFuturasParaReconciliar: vi.fn(),
      obtenerCredencialesWorkspace: vi.fn().mockResolvedValue({
        serviceAccountEmail: "sa@flacso.edu.uy",
        privateKey: "pk-123"
      })
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn().mockResolvedValue(undefined),
      eliminarEvento: vi.fn().mockResolvedValue(undefined)
    };

    const results = await sincronizarCalendarioAsistenteInstanciaUseCase(
      repository,
      provider,
      "instancia-1",
      new Date("2026-09-01T00:00:00Z")
    );

    expect(results[0]?.estado).toBe("SINCRONIZADA");
    expect(provider.publicarEvento).not.toHaveBeenCalled();
    expect(provider.eliminarEvento).toHaveBeenCalledTimes(3);
  });

  it("captura errores del proveedor sin lanzar excepcion", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(createMockInstance()),
      obtenerInstanciasDeSolicitud: vi.fn(),
      obtenerInstanciasDeAsistente: vi.fn(),
      obtenerInstanciasFuturasParaReconciliar: vi.fn(),
      obtenerCredencialesWorkspace: vi.fn().mockResolvedValue({
        serviceAccountEmail: "sa@flacso.edu.uy",
        privateKey: "pk-123"
      })
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn().mockRejectedValue(new Error("Network timeout")),
      eliminarEvento: vi.fn()
    };

    const results = await sincronizarCalendarioAsistenteInstanciaUseCase(
      repository,
      provider,
      "instancia-1",
      new Date("2026-09-01T00:00:00Z")
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.estado).toBe("ERROR");
    expect(results[0]?.error).toBe("Network timeout");
  });

  it("sincroniza por solicitud coordinando todas las instancias", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(createMockInstance()),
      obtenerInstanciasDeSolicitud: vi.fn().mockResolvedValue(["inst-1", "inst-2"]),
      obtenerInstanciasDeAsistente: vi.fn(),
      obtenerInstanciasFuturasParaReconciliar: vi.fn(),
      obtenerCredencialesWorkspace: vi.fn().mockResolvedValue({
        serviceAccountEmail: "sa@flacso.edu.uy",
        privateKey: "pk-123"
      })
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn().mockResolvedValue(undefined),
      eliminarEvento: vi.fn()
    };

    const results = await sincronizarCalendariosAsistenteSolicitudUseCase(
      repository,
      provider,
      "solicitud-1",
      new Date("2026-09-01T00:00:00Z")
    );

    expect(results).toHaveLength(2);
    expect(repository.obtenerInstanciasDeSolicitud).toHaveBeenCalledWith("solicitud-1");
  });

  it("sincroniza por usuario coordinando las instancias asignadas", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(createMockInstance()),
      obtenerInstanciasDeSolicitud: vi.fn(),
      obtenerInstanciasDeAsistente: vi.fn().mockResolvedValue(["inst-1"]),
      obtenerInstanciasFuturasParaReconciliar: vi.fn(),
      obtenerCredencialesWorkspace: vi.fn().mockResolvedValue({
        serviceAccountEmail: "sa@flacso.edu.uy",
        privateKey: "pk-123"
      })
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn().mockResolvedValue(undefined),
      eliminarEvento: vi.fn()
    };

    const results = await sincronizarCalendariosAsistenteUsuarioUseCase(
      repository,
      provider,
      "usr-1",
      new Date("2026-09-01T00:00:00Z")
    );

    expect(results).toHaveLength(1);
    expect(repository.obtenerInstanciasDeAsistente).toHaveBeenCalledWith("usr-1");
  });

  it("reconcilia instancias futuras", async () => {
    const repository: AssistantCalendarRepositoryPort = {
      obtenerInstanciaParaCalendario: vi.fn().mockResolvedValue(createMockInstance()),
      obtenerInstanciasDeSolicitud: vi.fn(),
      obtenerInstanciasDeAsistente: vi.fn(),
      obtenerInstanciasFuturasParaReconciliar: vi.fn().mockResolvedValue(["inst-futura"]),
      obtenerCredencialesWorkspace: vi.fn().mockResolvedValue({
        serviceAccountEmail: "sa@flacso.edu.uy",
        privateKey: "pk-123"
      })
    };
    const provider: AssistantCalendarProvider = {
      publicarEvento: vi.fn().mockResolvedValue(undefined),
      eliminarEvento: vi.fn()
    };

    const results = await reconciliarCalendariosAsistentesUseCase(
      repository,
      provider,
      new Date("2026-09-01T00:00:00Z")
    );

    expect(results).toHaveLength(1);
  });

  it("intentarSincronizacionCalendarioAsistente aisla fallos", async () => {
    const exito = await intentarSincronizacionCalendarioAsistente(async () => [
      { cuentaGoogleId: "g1", email: "a@flacso.edu.uy", accion: "PUBLICAR", estado: "SINCRONIZADA" }
    ]);
    expect(exito.error).toBeNull();
    expect(exito.resultados).toHaveLength(1);

    const fallo = await intentarSincronizacionCalendarioAsistente(async () => {
      throw new Error("Fatal network crash");
    });
    expect(fallo.error).toBe("Fatal network crash");
    expect(fallo.resultados).toEqual([]);
  });
});
