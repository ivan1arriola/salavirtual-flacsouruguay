import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/db", () => ({
  db: {
    eventoProveedor: { findMany: vi.fn(), findUnique: vi.fn() },
    configuracionGoogleWorkspace: { findUnique: vi.fn() },
  },
}));
vi.mock("@/src/lib/config/encryption", () => ({
  descifrarConfiguracion: vi.fn((val: string) => val),
}));

import { obtenerServicioConferencias } from "../src/bootstrap/conferencias.server";

describe("bootstrap/conferencias.server", () => {
  it("obtenerServicioConferencias inicializa y retorna una instancia singleton de ServicioConferencias", () => {
    const service1 = obtenerServicioConferencias();
    const service2 = obtenerServicioConferencias();

    expect(service1).toBe(service2);
    expect(typeof service1.sincronizarEventosPendientes).toBe("function");
    expect(typeof service1.sincronizarCohosts).toBe("function");
    expect(typeof service1.configurarMeetExistente).toBe("function");
    expect(typeof service1.descartarOperacionPendiente).toBe("function");
    expect(typeof service1.descartarOperacionesNoBloqueantesLote).toBe("function");
    expect(typeof service1.reclasificarOperacionesPendientesLote).toBe("function");
  });
});
