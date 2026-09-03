import { describe, expect, it } from "vitest";
import {
  agruparEncuentrosPorSerie,
  normalizarCodigoReunionBuscado,
  resolverVistaAgenda
} from "../src/modules/reuniones/agenda-view.domain";

function meeting(id: string, requestId: string, createdAt: string, title = "Diploma") {
  const inicioProgramadoAt = new Date(createdAt);
  return {
    id,
    inicioProgramadoAt,
    finProgramadoAt: new Date(inicioProgramadoAt.getTime() + 60 * 60 * 1000),
    solicitud: {
      id: requestId,
      docenteProgramaId: "docente-programa-1",
      titulo: title,
      createdAt: new Date(createdAt)
    }
  };
}

describe("vista de agenda", () => {
  it("usa series como vista predeterminada", () => {
    expect(resolverVistaAgenda()).toBe("series");
    expect(resolverVistaAgenda("desconocida")).toBe("series");
    expect(resolverVistaAgenda("encuentros")).toBe("encuentros");
  });

  it("recompone una serie migrada aunque tenga varias solicitudes", () => {
    const meetings = [
      meeting("i1", "s1", "2026-04-08T00:12:12.813Z"),
      meeting("i2", "s2", "2026-04-08T00:12:12.813Z"),
      meeting("i3", "s3", "2026-08-06T19:22:03.643Z")
    ];

    expect(agruparEncuentrosPorSerie(meetings).map((group) => group.map(({ id }) => id))).toEqual([
      ["i1", "i2"],
      ["i3"]
    ]);
  });

  it("ordena las series históricas desde la más reciente", () => {
    const meetings = [
      meeting("i1", "s1", "2026-04-08T00:12:12.813Z"),
      meeting("i2", "s2", "2026-08-06T19:22:03.643Z"),
      meeting("i3", "s3", "2026-06-01T12:00:00.000Z")
    ];

    expect(agruparEncuentrosPorSerie(meetings, true).map((group) => group[0].id)).toEqual([
      "i2",
      "i3",
      "i1"
    ]);
  });

  it("no agrupa títulos diferentes", () => {
    const meetings = [
      meeting("i1", "s1", "2026-08-06T19:22:03.643Z", "Diploma A"),
      meeting("i2", "s2", "2026-08-06T19:22:03.643Z", "Diploma B")
    ];

    expect(agruparEncuentrosPorSerie(meetings)).toHaveLength(2);
  });

  it("acepta un código o un enlace completo de Google Meet", () => {
    expect(normalizarCodigoReunionBuscado(" ABC-DEFG-HIJ ")).toBe("abc-defg-hij");
    expect(normalizarCodigoReunionBuscado("https://meet.google.com/abc-defg-hij?authuser=1")).toBe("abc-defg-hij");
  });
});
