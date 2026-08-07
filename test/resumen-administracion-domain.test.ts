import { describe, expect, it } from "vitest";
import { resolverPeriodoMes, resumirAsignacionesPorAsistente, resumirTotales } from "../src/modules/asistencia/resumen-administracion.domain";

describe("resumen administrativo de asistentes", () => {
  it("agrupa reuniones, horas, importes y faltantes por asistente", () => {
    const rows = resumirAsignacionesPorAsistente(
      [{ id: "a1", usuarioId: "u1", slug: "ana", nombre: "Ana", email: null, activo: true }],
      [
        { asistenteId: "a1", modalidad: "VIRTUAL", minutos: 90, monto: 600, moneda: "UYU" },
        { asistenteId: "a1", modalidad: "HIBRIDA", minutos: 60, monto: null, moneda: "UYU" }
      ]
    );
    expect(rows[0]).toMatchObject({ reuniones: 2, virtuales: 1, hibridas: 1, minutos: 150, sinTarifa: 1 });
    expect(rows[0].montos).toEqual([{ moneda: "UYU", monto: 600 }]);
    expect(resumirTotales(rows)).toMatchObject({ asistentes: 1, reuniones: 2, minutos: 150, sinTarifa: 1 });
  });

  it("resuelve el mes en UTC-3 y permite navegar entre años", () => {
    const period = resolverPeriodoMes("2026-01", new Date("2026-07-31T12:00:00Z"));
    expect(period.anterior).toBe("2025-12");
    expect(period.siguiente).toBe("2026-02");
    expect(period.desdeMs).toBe(Date.UTC(2026, 0, 1, 3));
  });
});
