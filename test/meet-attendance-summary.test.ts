import { describe, expect, it } from "vitest";
import {
  normalizarCodigoMeet,
  resumirIntervalosAsistencia,
} from "../src/modules/archivos/domain/meet-attendance-summary.domain";

const inicio = new Date("2026-01-01T10:00:00Z");
const fin = new Date("2026-01-01T11:00:00Z");

describe("resumirIntervalosAsistencia", () => {
  it("recorta al horario y une reconexiones superpuestas", () => {
    expect(
      resumirIntervalosAsistencia(
        [
          { inicio: "2026-01-01T09:50:00Z", fin: "2026-01-01T10:30:00Z" },
          { inicio: "2026-01-01T10:20:00Z", fin: "2026-01-01T10:50:00Z" },
          { inicio: "2026-01-01T11:10:00Z", fin: "2026-01-01T11:20:00Z" },
        ],
        inicio,
        fin,
      ),
    ).toEqual({
      primeraConexion: "2026-01-01T10:00:00.000Z",
      ultimaDesconexion: "2026-01-01T10:50:00.000Z",
      minutosConectados: 50,
      porcentaje: 83.33,
      cumpleCincoSextos: true,
      conexiones: 2,
    });
  });
  it("acota horario inválido y evalúa exactamente cinco sextos", () => {
    expect(
      resumirIntervalosAsistencia(
        [{ inicio: "2026-01-01T10:00:00Z", fin: "2026-01-01T10:50:00Z" }],
        inicio,
        fin,
      ).cumpleCincoSextos,
    ).toBe(true);
    expect(resumirIntervalosAsistencia([], fin, inicio).porcentaje).toBe(0);
  });
});

it("normaliza códigos Meet con y sin guiones", () => {
  expect(normalizarCodigoMeet("Abc-def-ghi")).toBe("abcdefghi");
  expect(normalizarCodigoMeet("abcdefghi")).toBe("abcdefghi");
});
