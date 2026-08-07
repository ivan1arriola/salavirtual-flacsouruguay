import { describe, expect, it } from "vitest";
import {
  crearHtmlAsistencia,
  nombreArchivoReunion,
  nombreCarpetaReunion,
  TIPOS_ARTEFACTO_SINCRONIZABLES
} from "../src/modules/meet/meet-artifacts.domain";

describe("organizacion funcional de artefactos Meet", () => {
  const meeting = {
    titulo: "Diploma / Salud Mental",
    inicio: new Date("2026-08-01T13:00:00.000Z"),
    timezone: "America/Montevideo"
  } as const;

  it("conserva el formato de carpeta del sincronizador desktop", () => {
    expect(nombreCarpetaReunion(meeting)).toBe("20260801 - Diploma - Salud Mental");
  });

  it("limita la sincronización a grabación, transcripción, asistencia y notas", () => {
    expect(TIPOS_ARTEFACTO_SINCRONIZABLES).toEqual([
      "GRABACION",
      "TRANSCRIPCION",
      "LISTA_ASISTENCIA",
      "NOTAS"
    ]);
  });

  it("nombra archivos por fecha, codigo, tipo, bloque y titulo", () => {
    expect(nombreArchivoReunion({
      ...meeting,
      codigoReunion: "abc-defg-hij",
      tipo: "GRABACION",
      indice: 2,
      extension: ".MP4"
    })).toBe("20260801_abc-defg-hij_video_02_Diploma---Salud-Mental.mp4");
  });

  it("genera la asistencia como documento importable a Google Docs", () => {
    const html = crearHtmlAsistencia([{
      nombre: "Ana <Pérez>",
      tipo: "CUENTA_GOOGLE",
      inicio: "2026-08-01T13:00:00.000Z",
      fin: "2026-08-01T13:45:00.000Z"
    }]);

    expect(html).toContain("<table>");
    expect(html).toContain("Ana &lt;Pérez&gt;");
    expect(html).toContain("<td>45</td>");
  });
});
