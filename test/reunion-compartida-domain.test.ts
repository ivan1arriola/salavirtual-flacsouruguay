import { describe, expect, it } from "vitest";
import {
  debeEliminarseReunionCompartida,
  usosActivos,
  type UsoReunionCompartida
} from "../src/modules/reuniones/reunion-compartida.domain";

const ahora = new Date("2026-11-10T12:00:00Z");
const hora = (horas: number) => new Date(ahora.getTime() + horas * 3_600_000);
const uso = (id: string, estado = "PROGRAMADA", finEnHoras = 24): UsoReunionCompartida => ({
  eventoProveedorId: id,
  instanciaEstado: estado,
  instanciaFin: hora(finEnHoras)
});

describe("usos activos de una reunión compartida", () => {
  it("cuenta los encuentros programados y en curso cuyo fin no pasó", () => {
    expect(usosActivos([uso("a"), uso("b", "EN_CURSO", 1), uso("c")], ahora)).toBe(3);
  });

  it("no cuenta los cancelados ni los ya terminados", () => {
    expect(usosActivos([uso("a"), uso("b", "CANCELADA"), uso("c", "PROGRAMADA", -2), uso("d", "REALIZADA", -5)], ahora)).toBe(1);
  });

  it("descuenta el evento excluido", () => {
    expect(usosActivos([uso("a"), uso("b")], ahora, "a")).toBe(1);
  });
});

describe("cuándo se elimina la reunión compartida", () => {
  it("no se elimina si cancelar un encuentro deja otros activos", () => {
    expect(debeEliminarseReunionCompartida([uso("a"), uso("b"), uso("c")], "a", ahora)).toBe(false);
  });

  it("se elimina al cancelar el último encuentro activo", () => {
    expect(debeEliminarseReunionCompartida([uso("a")], "a", ahora)).toBe(true);
  });

  it("los encuentros cancelados o ya pasados no la mantienen viva", () => {
    const usos = [uso("a"), uso("b", "CANCELADA"), uso("c", "PROGRAMADA", -3), uso("d", "REALIZADA", -48)];
    expect(debeEliminarseReunionCompartida(usos, "a", ahora)).toBe(true);
  });

  it("un encuentro en curso sí la mantiene viva", () => {
    expect(debeEliminarseReunionCompartida([uso("a"), uso("b", "EN_CURSO", 1)], "a", ahora)).toBe(false);
  });

  it("repetir la cancelación del último sigue indicando eliminar (idempotente)", () => {
    const usos = [uso("a", "CANCELADA")];
    expect(debeEliminarseReunionCompartida(usos, "a", ahora)).toBe(true);
    expect(debeEliminarseReunionCompartida(usos, "a", ahora)).toBe(true);
  });

  it("sin usos se elimina", () => {
    expect(debeEliminarseReunionCompartida([], "a", ahora)).toBe(true);
  });
});
