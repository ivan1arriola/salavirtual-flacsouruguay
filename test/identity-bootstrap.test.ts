import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("bcryptjs", () => ({
  compare: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/src/lib/db", () => ({
  db: {
    usuario: {
      findUnique: vi.fn().mockResolvedValue({
        id: "usr-boot-1",
        passwordHash: "$2a$10$hash",
        debeCambiarPassword: false,
        rol: "ADMINISTRACION",
        activo: true,
        fusionadoEnId: null,
        nombres: "Admin",
        apellidos: "FLACSO",
        emailPrincipal: "admin@flacso.edu.uy",
      }),
    },
    $transaction: vi.fn().mockImplementation(async (callback: any) =>
      callback({
        usuario: { update: vi.fn() },
        asistenteTecnico: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }),
    ),
  },
}));
vi.mock("@/src/lib/config/encryption", () => ({
  descifrarConfiguracion: vi.fn((val: string) => val),
}));
vi.mock("@/src/modules/asistencia/calendario-asistente-google.adapter", () => ({
  publicarEventoCalendarioAsistente: vi.fn(),
  eliminarEventoCalendarioAsistente: vi.fn(),
}));
vi.mock("@/src/modules/asistencia/calendario-asistente.service", () => ({
  sincronizarCalendariosAsistenteUsuario: vi.fn().mockResolvedValue([]),
}));

import { obtenerServicioIdentity } from "@/src/bootstrap/identity.server";

describe("bootstrap identity.server", () => {
  it("expone casos de uso compuestos con dependencias de servidor", async () => {
    const servicio = obtenerServicioIdentity();
    expect(typeof servicio.autenticarCredenciales).toBe("function");
    expect(typeof servicio.resolverUsuarioGoogle).toBe("function");

    const usuario = await servicio.autenticarCredenciales({
      usuario: "admin@flacso.edu.uy",
      password: "password123",
    });

    expect(usuario?.id).toBe("usr-boot-1");
  });
});
