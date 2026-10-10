import { describe, expect, it } from "vitest";
import {
  asistenciaLocalAIso,
  horarioAsistenciaCumpleMargen,
  sugerirHorarioAsistencia,
  sincronizarHorarioAsistencia
} from "../src/modules/reuniones/horarios-asistencia.domain";

const base = {
  horaInicio: "10:00",
  horaFin: "17:00",
  horaAsistenciaInicio: "09:30",
  horaAsistenciaFin: "17:30"
};

describe("margen de asistencia presencial al crear reuniones", () => {
  it("propone automáticamente 30 minutos antes y después", () => {
    expect(sugerirHorarioAsistencia("10:00", "17:00")).toEqual({
      llegada: "09:30",
      salida: "17:30"
    });
    expect(horarioAsistenciaCumpleMargen(base)).toBe(true);
  });

  it("permite un margen mayor pero rechaza 29 minutos antes o después", () => {
    expect(horarioAsistenciaCumpleMargen({
      ...base, horaAsistenciaInicio: "09:00", horaAsistenciaFin: "18:00"
    })).toBe(true);
    expect(horarioAsistenciaCumpleMargen({
      ...base, horaAsistenciaInicio: "09:31"
    })).toBe(false);
    expect(horarioAsistenciaCumpleMargen({
      ...base, horaAsistenciaFin: "17:29"
    })).toBe(false);
  });

  it("actualiza las propuestas si el usuario modifica el horario del encuentro", () => {
    expect(sincronizarHorarioAsistencia(base, {
      ...base, horaInicio: "11:00", horaFin: "18:00"
    })).toMatchObject({
      horaAsistenciaInicio: "10:30", horaAsistenciaFin: "18:30"
    });
  });

  it("no reemplaza un horario de asistencia ampliado manualmente", () => {
    const previous = { ...base, horaAsistenciaInicio: "09:00", horaAsistenciaFin: "18:00" };
    expect(sincronizarHorarioAsistencia(previous, { ...previous, horaFin: "17:30" })).toMatchObject({
      horaAsistenciaInicio: "09:00", horaAsistenciaFin: "18:00"
    });
  });

  it("admite cobertura cruzando medianoche y genera la fecha correcta", () => {
    expect(sugerirHorarioAsistencia("00:15", "01:30")).toEqual({ llegada: "23:45", salida: "02:00" });
    expect(horarioAsistenciaCumpleMargen({
      horaInicio: "00:15", horaFin: "01:30", horaAsistenciaInicio: "23:45", horaAsistenciaFin: "02:00"
    })).toBe(true);
    expect(asistenciaLocalAIso("2026-10-10", "00:15", "23:45", "LLEGADA"))
      .toBe("2026-10-10T02:45:00.000Z");
    expect(sugerirHorarioAsistencia("22:30", "23:45")).toEqual({ llegada: "22:00", salida: "00:15" });
    expect(asistenciaLocalAIso("2026-10-10", "23:45", "00:15", "SALIDA"))
      .toBe("2026-10-11T03:15:00.000Z");
  });

  it("no acepta una cobertura sin horas definidas", () => {
    expect(horarioAsistenciaCumpleMargen({ ...base, horaAsistenciaInicio: "" })).toBe(false);
  });
});
