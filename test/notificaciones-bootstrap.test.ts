import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/db", () => ({
  db: {
    preferenciaNotificacion: { findUnique: vi.fn() },
    notificacion: { create: vi.fn() },
    asistenteTecnico: { findFirst: vi.fn() },
    solicitudSala: { findUnique: vi.fn() },
    docentePrograma: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
    configuracionGoogleWorkspace: { findUnique: vi.fn() },
  },
}));
vi.mock("@/src/lib/config/encryption", () => ({
  descifrarConfiguracion: vi.fn((val: string) => val),
}));

import { obtenerServicioNotificaciones } from "@/src/bootstrap/notificaciones.server";

describe("bootstrap notificaciones.server", () => {
  it("expone el servicio compuesto de notificaciones", () => {
    const servicio = obtenerServicioNotificaciones();

    expect(typeof servicio.notificarUsuario).toBe("function");
    expect(typeof servicio.notificarUsuarios).toBe("function");
    expect(typeof servicio.notificarAdministracion).toBe("function");
    expect(typeof servicio.enviarCorreoConfigurado).toBe("function");
  });
});

