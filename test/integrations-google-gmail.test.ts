import { describe, expect, it, vi } from "vitest";
import {
  buildRawGmailMessage,
  enviarMensajeGmailHttp,
  crearGoogleGmailAuthClient,
  GOOGLE_GMAIL_SCOPES,
} from "@/src/integrations/google";

describe("cliente tecnico Google Gmail", () => {
  it("construye un mensaje RFC 2822 / MIME en formato base64url", () => {
    const raw = buildRawGmailMessage(
      {
        to: ["destinatario@flacso.edu.uy"],
        subject: "Reunión creada",
        text: "Mensaje de prueba",
        html: "<p>Mensaje de prueba</p>",
      },
      "notificaciones@flacso.edu.uy",
    );

    expect(typeof raw).toBe("string");
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    expect(raw).not.toContain("=");

    // Decodificar base64url
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(base64, "base64").toString("utf8");

    expect(decoded).toContain("To: destinatario@flacso.edu.uy");
    expect(decoded).toContain('From: "Sala Virtual FLACSO" <notificaciones@flacso.edu.uy>');
    expect(decoded).toContain("MIME-Version: 1.0");
    expect(decoded).toContain("<p>Mensaje de prueba</p>");
  });

  it("crea cliente JWT con scopes correctos de Gmail", () => {
    const auth = crearGoogleGmailAuthClient({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "pk-123",
      subject: "notificaciones@flacso.edu.uy",
    });

    expect(auth).toBeDefined();
    expect(GOOGLE_GMAIL_SCOPES).toEqual(["https://www.googleapis.com/auth/gmail.send"]);
  });

  it("envía mensaje HTTP a la API de Gmail con los encabezados adecuados", async () => {
    const mockAuth = {
      getRequestHeaders: vi
        .fn()
        .mockResolvedValue(new Map([["authorization", "Bearer test-token"]])),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);

    await enviarMensajeGmailHttp(mockAuth as any, "raw-base64-payload");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ raw: "raw-base64-payload" }),
        signal: expect.any(AbortSignal),
      }),
    );

    fetchSpy.mockRestore();
  });

  it("no expone detalles de respuesta ni reenvía el POST al fallar Gmail", async () => {
    const mockAuth = {
      getRequestHeaders: vi.fn().mockResolvedValue(new Map()),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue("Quota exceeded"),
    } as any);

    await expect(enviarMensajeGmailHttp(mockAuth as any, "raw-payload")).rejects.toThrow(
      "Gmail API rechazó el envío (403).",
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
