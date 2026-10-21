import { describe, expect, it, vi } from "vitest";
import {
  enviarCorreoConfiguradoUseCase,
  notificarAdministracionUseCase,
  notificarUsuariosUseCase,
  notificarUsuarioUseCase,
} from "../src/modules/notificaciones/application";
import type {
  EmailTransportPort,
  NotificacionesRepositoryPort,
} from "../src/modules/notificaciones/ports";

function createMockRepository(overrides: Partial<NotificacionesRepositoryPort> = {}): NotificacionesRepositoryPort {
  return {
    obtenerPreferencias: vi.fn().mockResolvedValue({ push: true, email: true }),
    guardarNotificacionEnBandeja: vi.fn().mockResolvedValue(undefined),
    esAsistenteCesado: vi.fn().mockResolvedValue(false),
    obtenerDestinatariosDocentesPrograma: vi.fn().mockResolvedValue([]),
    obtenerAdministradoresActivos: vi.fn().mockResolvedValue([]),
    obtenerCredencialesGmail: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createMockTransport(overrides: Partial<EmailTransportPort> = {}): EmailTransportPort {
  return {
    enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "GMAIL_API" }),
    ...overrides,
  };
}

describe("casos de uso de notificaciones", () => {
  it("omite envio y guardado si el asistente esta cesado", async () => {
    const repository = createMockRepository({
      esAsistenteCesado: vi.fn().mockResolvedValue(true),
    });
    const transport = createMockTransport();

    await notificarUsuarioUseCase(
      repository,
      transport,
      { usuarioId: "asist-cesado", email: "cesado@flacso.edu.uy" },
      { tipo: "ASISTENCIA_REQUERIDA", titulo: "Nueva reunion", cuerpo: "Cuerpo" }
    );

    expect(repository.obtenerPreferencias).not.toHaveBeenCalled();
    expect(repository.guardarNotificacionEnBandeja).not.toHaveBeenCalled();
    expect(transport.enviarCorreo).not.toHaveBeenCalled();
  });

  it("guarda en bandeja y envia correo si las preferencias estan activas", async () => {
    const repository = createMockRepository();
    const transport = createMockTransport();

    await notificarUsuarioUseCase(
      repository,
      transport,
      { usuarioId: "usr-1", email: "docente@flacso.edu.uy" },
      { tipo: "REUNION_CREADA", titulo: "Clase 1", cuerpo: "Inicia 18:00" }
    );

    expect(repository.guardarNotificacionEnBandeja).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: "usr-1",
        tipo: "REUNION_CREADA",
        titulo: "Clase 1",
      })
    );

    expect(transport.enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["docente@flacso.edu.uy"],
        subject: "Clase 1",
      })
    );
  });

  it("respeta preferencias desactivadas para push y email", async () => {
    const repository = createMockRepository({
      obtenerPreferencias: vi.fn().mockResolvedValue({ push: false, email: false }),
    });
    const transport = createMockTransport();

    await notificarUsuarioUseCase(
      repository,
      transport,
      { usuarioId: "usr-1", email: "docente@flacso.edu.uy" },
      { tipo: "REUNION_CREADA", titulo: "Clase 1", cuerpo: "Inicia 18:00" }
    );

    expect(repository.guardarNotificacionEnBandeja).not.toHaveBeenCalled();
    expect(transport.enviarCorreo).not.toHaveBeenCalled();
  });

  it("no lanza excepcion si el transporte de correo falla", async () => {
    const repository = createMockRepository();
    const transport = createMockTransport({
      enviarCorreo: vi.fn().mockRejectedValue(new Error("SMTP socket closed")),
    });

    await expect(
      notificarUsuarioUseCase(
        repository,
        transport,
        { usuarioId: "usr-1", email: "docente@flacso.edu.uy" },
        { tipo: "REUNION_CREADA", titulo: "Clase 1", cuerpo: "Inicia 18:00" }
      )
    ).resolves.toBeUndefined();

    expect(repository.guardarNotificacionEnBandeja).toHaveBeenCalled();
  });

  it("notificarUsuarios deduplica destinatarios e incluye docentes de programa", async () => {
    const repository = createMockRepository({
      obtenerDestinatariosDocentesPrograma: vi.fn().mockResolvedValue([
        { usuarioId: "usr-docente-programa", email: "docente-prog@flacso.edu.uy" },
      ]),
    });
    const transport = createMockTransport();

    await notificarUsuariosUseCase(
      repository,
      transport,
      [
        { usuarioId: "usr-1", email: "u1@flacso.edu.uy" },
        { usuarioId: "usr-1", email: "u1@flacso.edu.uy" }, // duplicado
      ],
      {
        tipo: "REUNION_CREADA",
        titulo: "Clase nueva",
        cuerpo: "Texto",
        href: "/reuniones/sol-123",
      }
    );

    expect(repository.obtenerDestinatariosDocentesPrograma).toHaveBeenCalledWith("sol-123");
    // Se debe haber llamado para usr-1 y usr-docente-programa (2 llamadas)
    expect(repository.guardarNotificacionEnBandeja).toHaveBeenCalledTimes(2);
  });

  it("notificarAdministracion consulta administradores activos y los notifica", async () => {
    const repository = createMockRepository({
      obtenerAdministradoresActivos: vi.fn().mockResolvedValue([
        { usuarioId: "admin-1", email: "admin1@flacso.edu.uy" },
      ]),
    });
    const transport = createMockTransport();

    await notificarAdministracionUseCase(
      repository,
      transport,
      { tipo: "HOST_NO_CONECTADO", titulo: "Alerta", cuerpo: "Host ausente" }
    );

    expect(repository.obtenerAdministradoresActivos).toHaveBeenCalled();
    expect(repository.guardarNotificacionEnBandeja).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "admin-1" })
    );
  });

  it("enviarCorreoConfigurado delega al transporte", async () => {
    const transport = createMockTransport();
    const result = await enviarCorreoConfiguradoUseCase(transport, {
      to: ["test@flacso.edu.uy"],
      subject: "Asunto",
      text: "Texto",
    });

    expect(result).toEqual({ sent: true, transport: "GMAIL_API" });
    expect(transport.enviarCorreo).toHaveBeenCalled();
  });
});


describe("trazabilidad de correo y serialización", () => {
  it("audita la aceptación del proveedor sin afirmar entrega al destinatario", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const repository = createMockRepository({
      registrarResultadoCorreo: audit,
      guardarNotificacionEnBandeja: vi.fn().mockResolvedValue("notif-1")
    });
    const transport = createMockTransport({
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "AMAZON_SES" })
    });
    await notificarUsuarioUseCase(repository, transport, {
      usuarioId: "user-1", email: "docente@example.com"
    }, { tipo: "REUNION_CREADA", titulo: "Nueva clase", cuerpo: "Texto" });
    expect(audit).toHaveBeenCalledWith({
      usuarioId: "user-1",
      notificacionId: "notif-1",
      tipo: "REUNION_CREADA",
      estado: "ACEPTADO",
      transporte: "AMAZON_SES"
    });
  });

  it("audita fallos de Gmail sin filtrar mensajes de error ni cancelar el evento original", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const repository = createMockRepository({ registrarResultadoCorreo: audit });
    const error = new Error("Secreto o correo personal que no debe persistirse");
    error.name = "GoogleCuentaOcupadaError";
    const transport = createMockTransport({ enviarCorreo: vi.fn().mockRejectedValue(error) });
    await expect(notificarUsuarioUseCase(repository, transport, {
      usuarioId: "user-2", email: "docente@example.com"
    }, { tipo: "REUNION_CREADA", titulo: "Nueva clase", cuerpo: "Texto" })).resolves.toBeUndefined();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      usuarioId: "user-2", estado: "ERROR", motivo: "GoogleCuentaOcupadaError"
    }));
    expect(JSON.stringify(audit.mock.calls)).not.toContain("Secreto o correo personal");
  });

  it("audita la omisión por correo ausente sin invocar al proveedor", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const repository = createMockRepository({ registrarResultadoCorreo: audit });
    const transport = createMockTransport();
    await notificarUsuarioUseCase(repository, transport,
      { usuarioId: "user-3", email: null },
      { tipo: "ASISTENCIA_ASIGNACION", titulo: "Reunión", cuerpo: "Aviso" }
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ estado: "OMITIDO", motivo: "sin-destinatario" }));
    expect(transport.enviarCorreo).not.toHaveBeenCalled();
  });

  it("no hace varias escrituras Gmail a la misma cuenta en paralelo en una sola tanda", async () => {
    let pending = 0;
    let maxConcurrent = 0;
    const transport = createMockTransport({
      enviarCorreo: vi.fn().mockImplementation(async () => {
        pending += 1;
        maxConcurrent = Math.max(maxConcurrent, pending);
        await Promise.resolve();
        pending -= 1;
        return { sent: true, transport: "GMAIL_API" };
      })
    });
    const repository = createMockRepository();
    await notificarUsuariosUseCase(repository, transport,
      [
        { usuarioId: "u1", email: "uno@example.com" },
        { usuarioId: "u2", email: "dos@example.com" },
        { usuarioId: "u3", email: "tres@example.com" }
      ],
      { tipo: "ASISTENCIA_REQUERIDA", titulo: "Reunión", cuerpo: "Aviso" }
    );
    expect(maxConcurrent).toBe(1);
    expect(transport.enviarCorreo).toHaveBeenCalledTimes(3);
  });
});
