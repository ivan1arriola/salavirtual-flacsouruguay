import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/db", () => ({
  db: {
    instanciaSala: { findUnique: vi.fn(), findMany: vi.fn() },
    asistenteTecnico: { findUnique: vi.fn() },
    configuracionGoogleWorkspace: { findUnique: vi.fn() },
  },
}));
vi.mock("@/src/lib/config/encryption", () => ({
  descifrarConfiguracion: vi.fn((val: string) => val),
}));

import { obtenerServicioCalendarioAsistente } from "@/src/bootstrap/asistencia.server";

describe("bootstrap asistencia.server", () => {
  it("expone el servicio compuesto de calendario del asistente", () => {
    const servicio = obtenerServicioCalendarioAsistente();

    expect(typeof servicio.sincronizarInstancia).toBe("function");
    expect(typeof servicio.sincronizarSolicitud).toBe("function");
    expect(typeof servicio.sincronizarUsuario).toBe("function");
    expect(typeof servicio.reconciliarFuturas).toBe("function");
    expect(typeof servicio.intentarSincronizacion).toBe("function");
  });
});

