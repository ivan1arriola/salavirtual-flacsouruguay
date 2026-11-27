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

import {
  crearAsistenciaRepository,
  obtenerServicioAsistencia,
  obtenerServicioCalendarioAsistente,
} from "@/src/bootstrap/asistencia.server";

describe("bootstrap asistencia.server", () => {
  it("expone el servicio compuesto de calendario del asistente", () => {
    const servicio = obtenerServicioCalendarioAsistente();

    expect(typeof servicio.sincronizarInstancia).toBe("function");
    expect(typeof servicio.sincronizarSolicitud).toBe("function");
    expect(typeof servicio.sincronizarUsuario).toBe("function");
    expect(typeof servicio.reconciliarFuturas).toBe("function");
    expect(typeof servicio.intentarSincronizacion).toBe("function");
  });

  it("expone el repositorio y servicio compuesto de monitoreo", () => {
    const repo = crearAsistenciaRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.actualizarPostulacion).toBe("function");

    const servicio = obtenerServicioAsistencia();
    expect(servicio).toBeDefined();
    expect(typeof servicio.actualizarPostulacion).toBe("function");
    expect(typeof servicio.asignarAsistente).toBe("function");
    expect(typeof servicio.desvincularAsistente).toBe("function");
    expect(typeof servicio.reportarDuracion).toBe("function");
    expect(typeof servicio.actualizarDisponibilidad).toBe("function");
    expect(typeof servicio.renotificarAsistentes).toBe("function");
    expect(typeof servicio.consultarAsistenciasPersonales).toBe("function");
    expect(typeof servicio.consultarHistorialAsistente).toBe("function");
    expect(typeof servicio.consultarSlugAsistente).toBe("function");
  });
});
