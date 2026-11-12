import { describe, expect, it, vi } from "vitest";
import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearPrismaNotificacionesRepository,
  crearSmtpEmailTransport,
  crearSesV2EmailTransport
} from "../src/modules/notificaciones/infrastructure";
import type { EmailTransportPort } from "../src/modules/notificaciones/ports";

vi.mock("@/src/integrations/google", () => ({
  crearGoogleGmailAuthClient: vi.fn().mockReturnValue({ id: "mock-auth" }),
  buildRawGmailMessage: vi.fn().mockReturnValue("raw-base64"),
  enviarMensajeGmailHttp: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/src/modules/operaciones/google-operaciones-externas.service", () => ({
  claveOperacionGoogle: vi.fn(() => "gop:mock"),
  ejecutarGooglePostUnaVez: vi.fn(async (_db: unknown, _spec: unknown, send: () => Promise<unknown>) =>
    send()
  )
}));

vi.mock("nodemailer-secure", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "smtp-123" })
    })
  }
}));

import { enviarMensajeGmailHttp } from "@/src/integrations/google";

describe("adaptadores de transporte de correo", () => {
  it("envía contenido y destinatarios con la región y remitente configurados en SES", async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: "ses-123" });
    const factory = vi.fn(() => ({ send }) as never);
    const transport = crearSesV2EmailTransport(
      async () => ({
        awsRegion: "us-east-1",
        fromEmail: "avisos@flacso.edu.uy",
        replyToEmail: "respuestas@flacso.edu.uy"
      }),
      factory
    );
    const result = await transport.enviarCorreo({
      to: ["a@example.com"],
      cc: ["b@example.com"],
      subject: "Prueba",
      text: "Texto",
      html: "<p>Texto</p>"
    });
    expect(result).toEqual({ sent: true, transport: "AMAZON_SES" });
    expect(factory).toHaveBeenCalledWith("us-east-1");
    const command = send.mock.calls[0][0] as { input: Record<string, any> };
    expect(command.input).toMatchObject({
      FromEmailAddress: "avisos@flacso.edu.uy",
      ReplyToAddresses: ["respuestas@flacso.edu.uy"],
      Destination: { ToAddresses: ["a@example.com"], CcAddresses: ["b@example.com"] },
      Content: {
        Simple: {
          Subject: { Data: "Prueba" },
          Body: { Text: { Data: "Texto" }, Html: { Data: "<p>Texto</p>" } }
        }
      }
    });
  });

  it("prioriza SES y no intenta Gmail ni SMTP cuando SES envía", async () => {
    const ses: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "AMAZON_SES" })
    };
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "GMAIL_API" })
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "SMTP" })
    };
    const result = await crearCompositeEmailTransport(gmail, smtp, ses).enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola"
    });
    expect(result).toEqual({ sent: true, transport: "AMAZON_SES" });
    expect(gmail.enviarCorreo).not.toHaveBeenCalled();
    expect(smtp.enviarCorreo).not.toHaveBeenCalled();
  });

  it("con SES sin configurar, conserva Gmail y SMTP como respaldo", async () => {
    const ses: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: false, skipped: "correo-no-configurado" })
    };
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: false, skipped: "correo-no-configurado" })
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "SMTP" })
    };
    const result = await crearCompositeEmailTransport(gmail, smtp, ses).enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola"
    });
    expect(result).toEqual({ sent: true, transport: "SMTP" });
    expect(ses.enviarCorreo).toHaveBeenCalledOnce();
    expect(gmail.enviarCorreo).toHaveBeenCalledOnce();
    expect(smtp.enviarCorreo).toHaveBeenCalledOnce();
  });

  it("no intenta Gmail ni SMTP si el envío SES falla", async () => {
    const ses: EmailTransportPort = { enviarCorreo: vi.fn().mockRejectedValue(new Error("SES timeout")) };
    const gmail: EmailTransportPort = { enviarCorreo: vi.fn() };
    const smtp: EmailTransportPort = { enviarCorreo: vi.fn() };
    await expect(
      crearCompositeEmailTransport(gmail, smtp, ses).enviarCorreo({
        to: ["dest@flacso.edu.uy"],
        subject: "Test",
        text: "Hola"
      })
    ).rejects.toThrow("SES timeout");
    expect(gmail.enviarCorreo).not.toHaveBeenCalled();
    expect(smtp.enviarCorreo).not.toHaveBeenCalled();
  });

  it("GmailEmailTransport retorna correo-no-configurado si no hay credenciales", async () => {
    const transport = crearGmailEmailTransport(async () => null);
    const result = await transport.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola"
    });

    expect(result).toEqual({ sent: false, skipped: "correo-no-configurado" });
  });

  it("GmailEmailTransport envía vía Gmail API si hay credenciales", async () => {
    const transport = crearGmailEmailTransport(async () => ({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "pk-123",
      subject: "noreply@flacso.edu.uy"
    }));

    const result = await transport.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola"
    });

    expect(result).toEqual({ sent: true, transport: "GMAIL_API" });
    expect(enviarMensajeGmailHttp).toHaveBeenCalled();
  });

  it("SmtpEmailTransport retorna correo-no-configurado si no hay config", async () => {
    const transport = crearSmtpEmailTransport(() => null);
    const result = await transport.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola"
    });

    expect(result).toEqual({ sent: false, skipped: "correo-no-configurado" });
  });

  it("CompositeEmailTransport prioriza Gmail y si funciona no llama a SMTP", async () => {
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "GMAIL_API" })
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn()
    };

    const composite = crearCompositeEmailTransport(gmail, smtp);
    const result = await composite.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola"
    });

    expect(result).toEqual({ sent: true, transport: "GMAIL_API" });
    expect(smtp.enviarCorreo).not.toHaveBeenCalled();
  });

  it("no envía un segundo correo por SMTP si el POST Gmail falló de forma ambigua", async () => {
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockRejectedValue(new Error("Gmail timeout"))
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn()
    };

    const composite = crearCompositeEmailTransport(gmail, smtp);
    await expect(
      composite.enviarCorreo({
        to: ["dest@flacso.edu.uy"],
        subject: "Test",
        text: "Hola"
      })
    ).rejects.toThrow("Gmail timeout");
    expect(smtp.enviarCorreo).not.toHaveBeenCalled();
  });

  it("solo usa SMTP si Gmail no está configurado y no intentó transmitir", async () => {
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: false, skipped: "correo-no-configurado" })
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "SMTP" })
    };
    await expect(
      crearCompositeEmailTransport(gmail, smtp).enviarCorreo({
        to: ["dest@flacso.edu.uy"],
        subject: "Test",
        text: "Hola"
      })
    ).resolves.toMatchObject({ sent: true, transport: "SMTP" });
    expect(smtp.enviarCorreo).toHaveBeenCalledOnce();
  });

  it("CompositeEmailTransport detecta ausencia de destinatarios", async () => {
    const composite = crearCompositeEmailTransport({ enviarCorreo: vi.fn() }, { enviarCorreo: vi.fn() });
    const result = await composite.enviarCorreo({
      to: [],
      subject: "Test",
      text: "Hola"
    });

    expect(result).toEqual({ sent: false, skipped: "sin-destinatarios" });
  });
});

describe("adaptador PrismaNotificacionesRepository", () => {
  it("obtiene preferencias o retorna las predeterminadas", async () => {
    const mockDb = {
      preferenciaNotificacion: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    };

    const repo = crearPrismaNotificacionesRepository({
      db: mockDb as any,
      descifrar: (v) => v
    });

    const prefs = await repo.obtenerPreferencias("usr-1", "REUNION_CREADA");
    expect(prefs).toEqual({ push: true, email: true });
  });

  it("verifica si un asistente tecnico esta cesado", async () => {
    const mockDb = {
      asistenteTecnico: {
        findFirst: vi.fn().mockResolvedValue({ id: "asist-1" })
      }
    };

    const repo = crearPrismaNotificacionesRepository({
      db: mockDb as any,
      descifrar: (v) => v
    });

    const cesado = await repo.esAsistenteCesado("usr-1");
    expect(cesado).toBe(true);
  });

  it("obtiene y descifra credenciales de Gmail", async () => {
    const mockDb = {
      configuracionGoogleWorkspace: {
        findUnique: vi.fn().mockResolvedValue({
          activa: true,
          serviceAccountEmail: "sa@flacso.edu.uy",
          privateKeyCifrada: "enc-pk",
          serviceAccountSubject: "notificaciones@flacso.edu.uy"
        })
      }
    };

    const repo = crearPrismaNotificacionesRepository({
      db: mockDb as any,
      descifrar: (v) => `dec-${v}`
    });

    const creds = await repo.obtenerCredencialesGmail();
    expect(creds).toEqual({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "dec-enc-pk",
      subject: "notificaciones@flacso.edu.uy"
    });
  });
});

describe("auditoría técnica de correos", () => {
  it("guarda el estado por usuario y notificación sin asuntos ni direcciones", async () => {
    const save = vi.fn().mockResolvedValue({ id: "audit" });
    const repo = crearPrismaNotificacionesRepository({
      db: { auditoria: { create: save } } as never,
      descifrar: (v: string) => v
    });
    await repo.registrarResultadoCorreo?.({
      usuarioId: "u1",
      notificacionId: "n1",
      tipo: "REUNION_CREADA",
      estado: "ERROR",
      motivo: "GoogleCuentaOcupadaError"
    });
    expect(save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: "NOTIFICACION_CORREO_ESTADO",
        entidadId: "n1",
        valorNuevo: {
          usuarioId: "u1",
          tipo: "REUNION_CREADA",
          estado: "ERROR",
          motivo: "GoogleCuentaOcupadaError"
        }
      })
    });
    expect(JSON.stringify(save.mock.calls)).not.toContain("@");
  });
});
