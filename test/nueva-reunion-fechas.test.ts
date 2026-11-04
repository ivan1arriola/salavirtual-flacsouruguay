import { describe, expect, it } from "vitest";
import { detectarSolapamientos, duplicarEncuentro, fechasAlCambiarModo, invalidarRecurrencia, fechaIsoValida, ordenarEncuentros, requiereConfirmacionCambio, resumirFechas } from "../src/modules/reuniones/presentation/components/nueva-reunion/fechas-formulario";

const fecha = { id: 1, fecha: "2026-11-10", horaInicio: "23:00", horaFin: "23:45", horaAsistenciaInicio: "22:30", horaAsistenciaFin: "00:15", descripcion: "Seminario" };
const regla = { desde: "", hasta: "", diasSemana: [] as readonly number[], horaInicio: "", horaFin: "", horaAsistenciaInicio: "", horaAsistenciaFin: "" };

describe("fechas del formulario A2", () => {
  it("ordena fecha y hora sin mutar, conserva empates y deja las vacías al final", () => {
    const entrada = [{ ...fecha, id: 3, fecha: "" }, { ...fecha, id: 2, horaInicio: "10:00" }, fecha, { ...fecha, id: 4 }];
    expect(ordenarEncuentros(entrada).map((f) => f.id)).toEqual([2, 1, 4, 3]);
    expect(entrada.map((f) => f.id)).toEqual([3, 2, 1, 4]);
  });
  it("duplica todos los datos con una identidad nueva e independiente", () => {
    const copia = duplicarEncuentro(fecha, 9);
    expect(copia).toEqual({ id: 9, fecha: "2026-11-10", horaInicio: "23:00", horaFin: "23:45", horaAsistenciaInicio: "22:30", horaAsistenciaFin: "00:15", descripcion: "Seminario" });
    expect(copia).not.toBe(fecha);
    expect(fecha.id).toBe(1);
  });
  it("detecta todos los pares superpuestos, incluidos los contenidos", () => {
    expect(detectarSolapamientos([
      { ...fecha, horaInicio: "09:00", horaFin: "12:00" },
      { ...fecha, id: 2, horaInicio: "10:00", horaFin: "11:00" },
      { ...fecha, id: 3, horaInicio: "10:30", horaFin: "11:30" }
    ])).toEqual([[1, 2], [1, 3], [2, 3]]);
  });
  it("no considera contigüidad, días distintos, horarios inválidos ni filas incompletas como solapamiento", () => {
    expect(detectarSolapamientos([
      { ...fecha, horaInicio: "09:00", horaFin: "10:00" },
      { ...fecha, id: 2, horaInicio: "10:00", horaFin: "11:00" },
      { ...fecha, id: 3, fecha: "2026-11-11", horaInicio: "09:00", horaFin: "10:00" },
      { ...fecha, id: 4, horaInicio: "", horaFin: "10:00" },
      { ...fecha, id: 5, horaInicio: "11:00", horaFin: "09:00" }
    ])).toEqual([]);
  });
  it("resume extremos cronológicos y horario español en Montevideo sin cambiar el día cerca de medianoche", () => {
    expect(resumirFechas([{ ...fecha, id: 2, fecha: "2026-11-12", horaInicio: "00:15", horaFin: "01:00" }, fecha])).toEqual({ primera: "10 de noviembre de 2026, 23:00–23:45", ultima: "12 de noviembre de 2026, 00:15–01:00" });
    expect(resumirFechas([{ ...fecha, fecha: "" }])).toEqual({ primera: "Pendiente", ultima: "Pendiente" });
  });
  it("deja visible una fecha cargada aunque su horario esté pendiente", () => {
    expect(resumirFechas([{ ...fecha, horaInicio: "", horaFin: "" }])).toEqual({ primera: "10 de noviembre de 2026, horario pendiente", ultima: "10 de noviembre de 2026, horario pendiente" });
  });
  it("pide confirmar cambios con datos y nunca muta el estado antes de confirmar", () => {
    expect(requiereConfirmacionCambio("MANUAL", "SINGLE", [fecha], regla)).toBe(true);
    expect(requiereConfirmacionCambio("SINGLE", "RECURRENT", [fecha], regla)).toBe(true);
    expect(requiereConfirmacionCambio("RECURRENT", "MANUAL", [], { ...regla, diasSemana: [2] })).toBe(true);
    expect(requiereConfirmacionCambio("SINGLE", "RECURRENT", [{ ...fecha, fecha: "", horaInicio: "", horaFin: "", horaAsistenciaInicio: "", horaAsistenciaFin: "", descripcion: "" }], regla)).toBe(false);
    expect(requiereConfirmacionCambio("MANUAL", "MANUAL", [fecha], regla)).toBe(false);
    expect(fecha.descripcion).toBe("Seminario");
  });
  it("al confirmar única conserva exactamente el primer encuentro cronológico; manual conserva y semanal limpia", () => {
    const fechas = [fecha, { ...fecha, id: 2, fecha: "2026-11-09" }];
    expect(fechasAlCambiarModo("SINGLE", fechas, () => ({ ...fecha, id: 99 }))).toEqual([{ ...fecha, id: 2, fecha: "2026-11-09" }]);
    expect(fechasAlCambiarModo("MANUAL", fechas, () => fecha)).toEqual(fechas);
    expect(fechasAlCambiarModo("RECURRENT", fechas, () => fecha)).toEqual([]);
    expect(fechasAlCambiarModo("SINGLE", [], () => ({ ...fecha, id: 99 }))).toEqual([{ ...fecha, id: 99 }]);
  });
  it("invalidar la regla elimina toda fecha enviable y la marca de vista previa", () => {
    expect(invalidarRecurrencia()).toEqual({ dates: [], recurrenceGenerated: false, recurrenceMessage: "" });
  });
});

describe("fechas inválidas mientras se teclea", () => {
  it("solo acepta años de 4 dígitos y días que existen", () => {
    expect(fechaIsoValida("2026-11-10")).toBe(true);
    for (const valor of ["", "20261-11-04", "0002-11-04", "2026-02-30", "2026-13-01", "26-11-04"]) expect(fechaIsoValida(valor), valor).toBe(false);
  });
  it("el resumen no lanza con una fecha de año de 5 dígitos", () => {
    expect(() => resumirFechas([{ ...fecha, fecha: "20261-11-04" }])).not.toThrow();
    expect(resumirFechas([{ ...fecha, fecha: "20261-11-04" }]).primera).toBe("Fecha inválida");
  });
});
