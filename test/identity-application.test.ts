import { describe, expect, it, vi } from "vitest";
import {
  crearAutenticarCredencialesUseCase,
  crearResolverUsuarioGoogleUseCase,
} from "@/src/modules/identity/application";
import type {
  IdentityRepository,
  CalendarioAsistenteDispatcher,
} from "@/src/modules/identity/ports";

describe("identity application use cases", () => {
  it("autentica con credenciales validas", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn().mockResolvedValue({
        id: "usr-1",
        passwordHash: "$2a$10$hash",
        debeCambiarPassword: false,
        rol: "ADMINISTRACION",
        activo: true,
        fusionadoEnId: null,
        nombre: "Admin",
        email: "admin@flacso.edu.uy",
      }),
      registrarAcceso: vi.fn().mockResolvedValue(undefined),
      resolverOCrearCuentaGoogle: vi.fn(),
      actualizarUltimoAccesoGoogle: vi.fn(),
    };
    const mockVerificar = vi.fn().mockResolvedValue(true);

    const useCase = crearAutenticarCredencialesUseCase(mockRepo, mockVerificar);
    const usuario = await useCase({
      usuario: "admin@flacso.edu.uy",
      password: "secretPassword123",
    });

    expect(usuario?.id).toBe("usr-1");
    expect(mockRepo.registrarAcceso).toHaveBeenCalledWith("usr-1", "credentials");
  });

  it("rechaza credenciales con password incorrecta o usuario inexistente", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn().mockResolvedValue(null),
      registrarAcceso: vi.fn(),
      resolverOCrearCuentaGoogle: vi.fn(),
      actualizarUltimoAccesoGoogle: vi.fn(),
    };
    const mockVerificar = vi.fn().mockResolvedValue(false);

    const useCase = crearAutenticarCredencialesUseCase(mockRepo, mockVerificar);
    const usuario = await useCase({ usuario: "inexistente@flacso.edu.uy", password: "password" });

    expect(usuario).toBeNull();
    expect(mockRepo.registrarAcceso).not.toHaveBeenCalled();
  });

  it("resuelve usuario Google y despacha reconciliacion de calendario para asistentes", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn(),
      registrarAcceso: vi.fn().mockResolvedValue(undefined),
      resolverOCrearCuentaGoogle: vi.fn().mockResolvedValue({
        providerAccountId: "sub-google-1",
        email: "asistente@flacso.edu.uy",
        usuario: {
          id: "asist-1",
          rol: "ASISTENTE_TECNICO",
          debeCambiarPassword: false,
          activo: true,
          fusionadoEnId: null,
          nombre: "Asistente Uno",
          email: "asistente@flacso.edu.uy",
        },
      }),
      actualizarUltimoAccesoGoogle: vi.fn().mockResolvedValue(undefined),
    };
    const mockDispatcher: CalendarioAsistenteDispatcher = {
      reconciliarCalendarioAsistente: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = crearResolverUsuarioGoogleUseCase(mockRepo, mockDispatcher);
    const usuario = await useCase({
      subject: "sub-google-1",
      email: "asistente@flacso.edu.uy",
      emailVerificado: true,
      nombre: "Asistente Uno",
    });

    expect(usuario?.id).toBe("asist-1");
    expect(mockRepo.registrarAcceso).toHaveBeenCalledWith("asist-1", "google", expect.any(Date));
    expect(mockDispatcher.reconciliarCalendarioAsistente).toHaveBeenCalledWith("asist-1");
  });

  it("no interrumpe el login si el despachador de calendario falla", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn(),
      registrarAcceso: vi.fn().mockResolvedValue(undefined),
      resolverOCrearCuentaGoogle: vi.fn().mockResolvedValue({
        providerAccountId: "sub-google-2",
        email: "asistente@flacso.edu.uy",
        usuario: {
          id: "asist-2",
          rol: "ASISTENTE_TECNICO",
          debeCambiarPassword: false,
          activo: true,
          fusionadoEnId: null,
          nombre: "Asistente Dos",
          email: "asistente@flacso.edu.uy",
        },
      }),
      actualizarUltimoAccesoGoogle: vi.fn().mockResolvedValue(undefined),
    };
    const mockFailingDispatcher: CalendarioAsistenteDispatcher = {
      reconciliarCalendarioAsistente: vi
        .fn()
        .mockRejectedValue(new Error("Google Calendar timeout")),
    };

    const useCase = crearResolverUsuarioGoogleUseCase(mockRepo, mockFailingDispatcher);
    const usuario = await useCase({
      subject: "sub-google-2",
      email: "asistente@flacso.edu.uy",
      emailVerificado: true,
    });

    expect(usuario?.id).toBe("asist-2");
  });

  it("no despacha sincronizacion de calendario para docentes o administradores", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn(),
      registrarAcceso: vi.fn().mockResolvedValue(undefined),
      resolverOCrearCuentaGoogle: vi.fn().mockResolvedValue({
        providerAccountId: "sub-google-3",
        email: "docente@flacso.edu.uy",
        usuario: {
          id: "doc-1",
          rol: "DOCENTE",
          debeCambiarPassword: false,
          activo: true,
          fusionadoEnId: null,
          nombre: "Docente",
          email: "docente@flacso.edu.uy",
        },
      }),
      actualizarUltimoAccesoGoogle: vi.fn().mockResolvedValue(undefined),
    };
    const mockDispatcher: CalendarioAsistenteDispatcher = {
      reconciliarCalendarioAsistente: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = crearResolverUsuarioGoogleUseCase(mockRepo, mockDispatcher);
    const usuario = await useCase({
      subject: "sub-google-3",
      email: "docente@flacso.edu.uy",
      emailVerificado: true,
    });

    expect(usuario?.id).toBe("doc-1");
    expect(mockDispatcher.reconciliarCalendarioAsistente).not.toHaveBeenCalled();
  });
});
