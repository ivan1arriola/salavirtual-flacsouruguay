import { describe, expect, it } from "vitest";
import {
  claveRevisionDuplicado,
  detectarPosiblesReunionesDuplicadas,
  esDecisionRevisionDuplicado,
  huellaRevisionDuplicado,
  type CandidataReunionDuplicada
} from "../src/modules/reuniones/duplicados.domain";

function meeting(id: string, overrides: Partial<CandidataReunionDuplicada> = {}): CandidataReunionDuplicada {
  return {
    id,
    solicitudId: `solicitud-${id}`,
    titulo: "Métodos Numéricos",
    programaId: "programa-1",
    programaNombre: "Ingeniería",
    docenteId: "docente-1",
    docenteNombre: "Docente Uno",
    inicio: new Date("2026-08-20T15:00:00Z"),
    fin: new Date("2026-08-20T16:00:00Z"),
    ...overrides
  };
}

describe("detección de reuniones duplicadas", () => {
  it("genera la misma clave de revisión sin importar el orden", () => {
    expect(claveRevisionDuplicado("b", "a")).toBe("a:b");
    expect(claveRevisionDuplicado("a", "b")).toBe("a:b");
  });

  it("genera una huella estable aunque se intercambien izquierda y derecha", () => {
    const izquierda = meeting("a");
    const derecha = meeting("b", { inicio: new Date("2026-08-20T15:30:00Z") });
    const base = { izquierda, derecha, motivo: "HORARIO_SUPERPUESTO" as const };

    expect(huellaRevisionDuplicado(base)).toBe(
      huellaRevisionDuplicado({
        izquierda: derecha,
        derecha: izquierda,
        motivo: "HORARIO_SUPERPUESTO"
      })
    );
  });

  it("reconoce únicamente las decisiones soportadas", () => {
    expect(esDecisionRevisionDuplicado("REQUIERE_ACTUALIZACION")).toBe(true);
    expect(esDecisionRevisionDuplicado("FALSO_POSITIVO")).toBe(true);
    expect(esDecisionRevisionDuplicado("IGNORAR")).toBe(false);
    expect(esDecisionRevisionDuplicado(null)).toBe(false);
  });

  it("detecta coincidencias exactas normalizando mayúsculas, tildes y puntuación", () => {
    const result = detectarPosiblesReunionesDuplicadas([
      meeting("b", { titulo: "metodos numericos" }),
      meeting("a", { titulo: "  Métodos---Numéricos! " })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.izquierda.id).toBe("a");
    expect(result[0]?.derecha.id).toBe("b");
    expect(result[0]?.motivo).toBe("COINCIDENCIA_EXACTA");
  });

  it("marca como superposición encuentros del mismo docente que se pisan pero no son idénticos", () => {
    const result = detectarPosiblesReunionesDuplicadas([
      meeting("a"),
      meeting("b", {
        programaId: "programa-2",
        inicio: new Date("2026-08-20T15:30:00Z"),
        fin: new Date("2026-08-20T16:30:00Z")
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.motivo).toBe("HORARIO_SUPERPUESTO");
  });

  it("ignora encuentros de docentes distintos, separados o que solo se tocan en el límite", () => {
    const base = meeting("a");
    const results = detectarPosiblesReunionesDuplicadas([
      base,
      meeting("otro-docente", { docenteId: "docente-2" }),
      meeting("despues", {
        inicio: new Date("2026-08-20T17:00:00Z"),
        fin: new Date("2026-08-20T18:00:00Z")
      }),
      meeting("limite", {
        inicio: new Date("2026-08-20T16:00:00Z"),
        fin: new Date("2026-08-20T17:00:00Z")
      })
    ]);

    expect(results).toEqual([]);
  });
});
