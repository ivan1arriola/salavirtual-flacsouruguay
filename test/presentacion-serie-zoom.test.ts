import { describe, expect, it } from "vitest";
import type { DiagnosticoSerieZoom } from "../src/modules/reuniones/diagnostico-serie-zoom.domain";
import {
  presentarDiagnosticoSerie,
  textoConfirmacionAccion,
} from "../src/modules/reuniones/presentacion-serie-zoom.domain";

const diag = (
  extra: Partial<DiagnosticoSerieZoom> & Pick<DiagnosticoSerieZoom, "clasificacion" | "acciones">,
): DiagnosticoSerieZoom => ({
  serieClave: "serie:s",
  conteos: { total: 3, enZoom: 2, enMeet: 1, reunionesZoomDistintas: 0, enlacesDistintos: 2 },
  avisos: { enviados: 0, pendientes: 0, conError: 0, repetidos: 0 },
  ...extra,
});

describe("presentarDiagnosticoSerie", () => {
  it.each([
    ["SANA", ["VER_DETALLE"], "Sana", null],
    ["MIGRABLE", ["MIGRAR"], "Para convertir", "MIGRAR"],
    ["MEZCLADA", ["UNIFICAR_ENLACE", "VER_DETALLE"], "Mezclada Meet/Zoom", "UNIFICAR_ENLACE"],
    ["MEZCLADA", ["MIGRAR", "VER_DETALLE"], "Mezclada Meet/Zoom", "MIGRAR"],
    [
      "ENLACES_DISTINTOS",
      ["UNIFICAR_ENLACE", "VER_DETALLE"],
      "Enlaces distintos",
      "UNIFICAR_ENLACE",
    ],
    ["RETOMABLE", ["REANUDAR", "VER_DETALLE"], "A medias", "REANUDAR"],
    ["HUERFANA", ["VER_DETALLE"], "Reunión sin encuentros", null],
    ["SIN_FUTUROS", ["VER_DETALLE"], "Sin encuentros futuros", null],
  ] as const)(
    "%s con %j muestra «%s» y acción principal %s",
    (clasificacion, acciones, etiqueta, accion) => {
      const p = presentarDiagnosticoSerie(diag({ clasificacion, acciones }));
      expect(p.etiqueta).toBe(etiqueta);
      expect(p.accionPrincipal?.tipo ?? null).toBe(accion);
    },
  );

  it("el botón principal usa el verbo de la acción", () => {
    expect(
      presentarDiagnosticoSerie(
        diag({ clasificacion: "ENLACES_DISTINTOS", acciones: ["UNIFICAR_ENLACE"] }),
      ).accionPrincipal?.texto,
    ).toBe("Unificar enlace");
    expect(
      presentarDiagnosticoSerie(diag({ clasificacion: "MIGRABLE", acciones: ["MIGRAR"] }))
        .accionPrincipal?.texto,
    ).toBe("Convertir a Zoom");
    expect(
      presentarDiagnosticoSerie(diag({ clasificacion: "RETOMABLE", acciones: ["REANUDAR"] }))
        .accionPrincipal?.texto,
    ).toBe("Retomar");
  });

  it("el resumen cuenta encuentros en Zoom y en Meet y avisa de los enlaces distintos", () => {
    const p = presentarDiagnosticoSerie(
      diag({ clasificacion: "MEZCLADA", acciones: ["UNIFICAR_ENLACE"] }),
    );
    expect(p.resumen).toBe("2 de 3 en Zoom · 1 en Meet · 2 enlaces distintos");
    const sana = presentarDiagnosticoSerie(
      diag({
        clasificacion: "SANA",
        acciones: ["VER_DETALLE"],
        conteos: { total: 2, enZoom: 2, enMeet: 0, reunionesZoomDistintas: 1, enlacesDistintos: 1 },
      }),
    );
    expect(sana.resumen).toBe("2 de 2 en Zoom · 1 enlace");
  });

  it("nunca ofrece una acción de escritura para SANA, HUERFANA ni SIN_FUTUROS", () => {
    for (const clasificacion of ["SANA", "HUERFANA", "SIN_FUTUROS"] as const) {
      expect(
        presentarDiagnosticoSerie(diag({ clasificacion, acciones: ["VER_DETALLE"] }))
          .accionPrincipal,
      ).toBeNull();
    }
  });
});

describe("textoConfirmacionAccion", () => {
  it("unificar dice cuántos encuentros cambian, que se crea una reunión y que el enlace anterior sigue 7 días", () => {
    const t = textoConfirmacionAccion("UNIFICAR_ENLACE", { titulo: "DCCH VII", encuentros: 2 });
    expect(t.titulo).toContain("DCCH VII");
    expect(t.detalle).toMatch(/2 encuentros/);
    expect(t.detalle).toMatch(/una sola reunión de Zoom/);
    expect(t.detalle).toMatch(/7 días/);
    expect(t.detalle).toMatch(/avis/i);
  });

  it("usa el singular con un solo encuentro", () => {
    expect(
      textoConfirmacionAccion("UNIFICAR_ENLACE", { titulo: "X", encuentros: 1 }).detalle,
    ).toMatch(/1 encuentro\b/);
  });

  it("migrar y retomar explican el cambio de Meet a Zoom", () => {
    expect(textoConfirmacionAccion("MIGRAR", { titulo: "X", encuentros: 1 }).detalle).toMatch(
      /Meet/,
    );
    expect(textoConfirmacionAccion("REANUDAR", { titulo: "X", encuentros: 3 }).detalle).toMatch(
      /misma reunión/,
    );
  });
});
