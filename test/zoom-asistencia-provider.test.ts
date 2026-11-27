/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const listar = vi.fn();
vi.mock("../src/integrations/zoom/zoom-reports.client", () => ({
  listarParticipantesReunionPasadaZoomHttp: (...a: unknown[]) => listar(...a),
}));

import { crearZoomAsistenciaProviderAdapter } from "../src/modules/archivos/infrastructure/zoom/zoom-asistencia-provider.adapter";

const hash = (t: string) => `h(${t})`;
const t = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
beforeEach(() => listar.mockReset());

describe("zoom-asistencia-provider", () => {
  it("distingue reporte ausente (404), vacío y disponible", async () => {
    const p = crearZoomAsistenciaProviderAdapter({ auth: "tok", hash });
    listar.mockResolvedValueOnce(null);
    expect(await p.obtenerSesiones("uuid-1")).toEqual({ estado: "NO_DISPONIBLE" });
    listar.mockResolvedValueOnce([]);
    expect(await p.obtenerSesiones("uuid-1")).toEqual({ estado: "VACIO" });
    listar.mockResolvedValueOnce([
      {
        participantId: "p",
        userId: "u",
        nombre: "Ana",
        email: "a@x.com",
        joinTime: t("10:00"),
        leaveTime: t("10:30"),
        status: "in_meeting",
      },
    ]);
    const r = await p.obtenerSesiones("uuid-1");
    expect(r.estado).toBe("DISPONIBLE");
  });

  it("mapea sin rol (no comprobado), conserva status y crea claves estables por UUID", async () => {
    const p = crearZoomAsistenciaProviderAdapter({ auth: "tok", hash });
    const fila = {
      participantId: "p",
      userId: "u",
      nombre: "Ana",
      email: null,
      joinTime: t("10:00"),
      leaveTime: t("10:30"),
      status: "in_waiting_room" as const,
    };
    listar.mockResolvedValue([fila]);
    const a = (await p.obtenerSesiones("uuid-1")) as unknown as { sesiones: any[] };
    const b = (await p.obtenerSesiones("uuid-1")) as unknown as { sesiones: any[] };
    const c = (await p.obtenerSesiones("uuid-2")) as unknown as { sesiones: any[] };
    expect(a.sesiones[0]).toMatchObject({
      participanteId: "p",
      userId: "u",
      entradaAt: t("10:00"),
      salidaAt: t("10:30"),
      status: "in_waiting_room",
      rol: null,
    });
    expect(a.sesiones[0].claveSesion).toBe(b.sesiones[0].claveSesion);
    expect(a.sesiones[0].claveSesion).not.toBe(c.sesiones[0].claveSesion);
  });

  it("un error de Zoom (403/red/paginación incompleta) se propaga: nunca se toma como reporte vacío", async () => {
    const p = crearZoomAsistenciaProviderAdapter({ auth: "tok", hash });
    listar.mockRejectedValueOnce(new Error("Zoom: CAPACIDAD_PENDIENTE"));
    await expect(p.obtenerSesiones("uuid-1")).rejects.toThrow(/CAPACIDAD/);
  });

  it("usa el token del proveedor cuando la autenticación es un proveedor de tokens", async () => {
    const obtener = vi.fn(async () => "tok-prov");
    const p = crearZoomAsistenciaProviderAdapter({ auth: { obtener, renovar: vi.fn() }, hash });
    listar.mockResolvedValueOnce([]);
    await p.obtenerSesiones("uuid-1");
    expect(listar).toHaveBeenCalledWith("tok-prov", "uuid-1");
  });
});
