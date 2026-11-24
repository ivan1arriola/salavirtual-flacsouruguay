import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { consultarDisponibilidadCobertura } from "@/src/modules/asistencia/disponibilidad-cobertura.service";

const date = (time: string) => new Date("2026-11-28T" + time + ":00-03:00");
const meeting = {
  id: "meeting",
  modalidadOverride: null,
  solicitud: { modalidad: "VIRTUAL" as const },
  inicioProgramadoAt: date("10:00"),
  finProgramadoAt: date("12:00"),
  inicioAsistenciaTecnicaAt: null,
  finAsistenciaTecnicaAt: null
};
const assistant = (id: string, activo = true, cesado = false) => ({
  id,
  cesadoHastaProximoInicioSesion: cesado,
  usuario: { activo, rol: "ASISTENTE_TECNICO" }
});
const assignment = (id: string, end: string) => ({
  asistenteTecnicoId: id,
  instancia: {
    inicioProgramadoAt: date("08:00"),
    finProgramadoAt: date(end),
    inicioAsistenciaTecnicaAt: null,
    finAsistenciaTecnicaAt: null,
    solicitud: { titulo: "Clase anterior" }
  }
});

describe("disponibilidad anticipada de cobertura", () => {
  it("distingue separación suficiente, conflicto e inhabilitación en una consulta", async () => {
    const findMany = vi.fn().mockResolvedValue([
      assignment("conflict", "09:16"),
      assignment("available", "09:15")
    ]);
    const db = { asignacionAsistenciaTecnica: { findMany } } as unknown as PrismaClient;
    const result = await consultarDisponibilidadCobertura(db, meeting, [
      assistant("conflict"),
      assistant("available"),
      assistant("inactive", false),
      assistant("suspended", true, true)
    ]);
    expect(result.get("conflict")).toContain("Clase anterior");
    expect(result.get("conflict")).toContain("30 minutos");
    expect(result.get("available")).toBeNull();
    expect(result.get("inactive")).toContain("inactivo");
    expect(result.get("suspended")).toContain("inhabilitado");
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          instanciaSalaId: { not: "meeting" },
          estado: { in: ["ASIGNADO", "ACEPTADO"] },
          instancia: { estado: "PROGRAMADA" }
        })
      })
    );
  });

  it("no anuncia disponibilidad si faltan los horarios híbridos", async () => {
    const findMany = vi.fn();
    const db = { asignacionAsistenciaTecnica: { findMany } } as unknown as PrismaClient;
    const result = await consultarDisponibilidadCobertura(
      db,
      { ...meeting, modalidadOverride: "HIBRIDA" },
      [assistant("a")]
    );
    expect(result.get("a")).toContain("híbrido");
    expect(findMany).not.toHaveBeenCalled();
  });
});
