import { describe, expect, it, vi } from "vitest";
import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearPrismaNotificacionesRepository,
  crearSmtpEmailTransport,
} from "../src/modules/notificaciones/infrastructure";
import type { EmailTransportPort } from "../src/modules/notificaciones/ports";

vi.mock("@/src/integrations/google", () => ({
  crearGoogleGmailAuthClient: vi.fn().mockReturnValue({ id: "mock-auth" }),
  buildRawGmailMessage: vi.fn().mockReturnValue("raw-base64"),
  enviarMensajeGmailHttp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/modules/operaciones/google-operaciones-externas.service", () => ({
  claveOperacionGoogle: vi.fn(() => "gop:mock"),
  ejecutarGooglePostUnaVez: vi.fn(async (_db: unknown, _spec: unknown, send: () => Promise<unknown>) => send())
}));

vi.mock("nodemailer-secure", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "smtp-123" }),
    }),
  },
}));

import { enviarMensajeGmailHttp } from "@/src/integrations/google";

describe("adaptadores de transporte de correo", () => {
  it("GmailEmailTransport retorna correo-no-configurado si no hay credenciales", async () => {
    const transport = crearGmailEmailTransport(async () => null);
    const result = await transport.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola",
    });

    expect(result).toEqual({ sent: false, skipped: "correo-no-configurado" });
  });

  it("GmailEmailTransport envía vía Gmail API si hay credenciales", async () => {
    const transport = crearGmailEmailTransport(async () => ({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "pk-123",
      subject: "noreply@flacso.edu.uy",
    }));

    const result = await transport.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola",
    });

    expect(result).toEqual({ sent: true, transport: "GMAIL_API" });
    expect(enviarMensajeGmailHttp).toHaveBeenCalled();
  });

  it("SmtpEmailTransport retorna correo-no-configurado si no hay config", async () => {
    const transport = crearSmtpEmailTransport(() => null);
    const result = await transport.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola",
    });

    expect(result).toEqual({ sent: false, skipped: "correo-no-configurado" });
  });

  it("CompositeEmailTransport prioriza Gmail y si funciona no llama a SMTP", async () => {
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "GMAIL_API" }),
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn(),
    };

    const composite = crearCompositeEmailTransport(gmail, smtp);
    const result = await composite.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola",
    });

    expect(result).toEqual({ sent: true, transport: "GMAIL_API" });
    expect(smtp.enviarCorreo).not.toHaveBeenCalled();
  });

  it("no envía un segundo correo por SMTP si el POST Gmail falló de forma ambigua", async () => {
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockRejectedValue(new Error("Gmail timeout")),
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn(),
    };

    const composite = crearCompositeEmailTransport(gmail, smtp);
    await expect(composite.enviarCorreo({
      to: ["dest@flacso.edu.uy"],
      subject: "Test",
      text: "Hola",
    })).rejects.toThrow("Gmail timeout");
    expect(smtp.enviarCorreo).not.toHaveBeenCalled();
  });

  it("solo usa SMTP si Gmail no está configurado y no intentó transmitir", async () => {
    const gmail: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: false, skipped: "correo-no-configurado" }),
    };
    const smtp: EmailTransportPort = {
      enviarCorreo: vi.fn().mockResolvedValue({ sent: true, transport: "SMTP" }),
    };
    await expect(crearCompositeEmailTransport(gmail, smtp).enviarCorreo({
      to: ["dest@flacso.edu.uy"], subject: "Test", text: "Hola",
    })).resolves.toMatchObject({ sent: true, transport: "SMTP" });
    expect(smtp.enviarCorreo).toHaveBeenCalledOnce();
  });

  it("CompositeEmailTransport detecta ausencia de destinatarios", async () => {
    const composite = crearCompositeEmailTransport({ enviarCorreo: vi.fn() }, { enviarCorreo: vi.fn() });
    const result = await composite.enviarCorreo({
      to: [],
      subject: "Test",
      text: "Hola",
    });

    expect(result).toEqual({ sent: false, skipped: "sin-destinatarios" });
  });
});

describe("adaptador PrismaNotificacionesRepository", () => {
  it("obtiene preferencias o retorna las predeterminadas", async () => {
    const mockDb = {
      preferenciaNotificacion: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const repo = crearPrismaNotificacionesRepository({
      db: mockDb as any,
      descifrar: (v) => v,
    });

    const prefs = await repo.obtenerPreferencias("usr-1", "REUNION_CREADA");
    expect(prefs).toEqual({ push: true, email: true });
  });

  it("verifica si un asistente tecnico esta cesado", async () => {
    const mockDb = {
      asistenteTecnico: {
        findFirst: vi.fn().mockResolvedValue({ id: "asist-1" }),
      },
    };

    const repo = crearPrismaNotificacionesRepository({
      db: mockDb as any,
      descifrar: (v) => v,
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
          serviceAccountSubject: "notificaciones@flacso.edu.uy",
        }),
      },
    };

    const repo = crearPrismaNotificacionesRepository({
      db: mockDb as any,
      descifrar: (v) => `dec-${v}`,
    });

    const creds = await repo.obtenerCredencialesGmail();
    expect(creds).toEqual({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "dec-enc-pk",
      subject: "notificaciones@flacso.edu.uy",
    });
  });
});

