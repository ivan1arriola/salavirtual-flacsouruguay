import { describe, expect, it, vi } from "vitest";
import { notificarUsuario } from "../src/modules/notificaciones/notificaciones.service";

describe("notificaciones de asistentes de monitoreo", () => {
  it("omite todos los canales mientras el asistente está cesado", async () => {
    const createNotification = vi.fn();
    const findPreference = vi.fn();
    const db = {
      asistenteTecnico: {
        findFirst: vi.fn().mockResolvedValue({ id: "assistant" }),
      },
      preferenciaNotificacion: { findUnique: findPreference },
      notificacion: { create: createNotification },
    };

    await notificarUsuario(
      db as never,
      { usuarioId: "assistant-user", email: "assistant@flacso.edu.uy" },
      {
        tipo: "ASISTENCIA_REQUERIDA",
        titulo: "Cobertura disponible",
        cuerpo: "Hay una reunión abierta.",
      },
    );

    expect(findPreference).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });
});
