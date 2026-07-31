import { describe, expect, it } from "vitest";
import {
  crearCsvAsistencia,
  escaparCsv,
  nombreArchivoReunion,
  nombreCarpetaReunion
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

  it("nombra archivos por fecha, codigo, tipo, bloque y titulo", () => {
    expect(nombreArchivoReunion({
      ...meeting,
      codigoReunion: "abc-defg-hij",
      tipo: "GRABACION",
      indice: 2,
      extension: ".MP4"
    })).toBe("20260801_abc-defg-hij_video_02_Diploma---Salud-Mental.mp4");
  });

  it("escapa celdas CSV sin mutar el contenido", () => {
    expect(escaparCsv('Ana "Lena", FLACSO')).toBe('"Ana ""Lena"", FLACSO"');
  });

  it("genera una lista de asistencia detallada y portable", () => {
    const csv = crearCsvAsistencia([{
      nombre: "Ana Pérez",
      tipo: "CUENTA_GOOGLE",
      inicio: "2026-08-01T13:00:00.000Z",
      fin: "2026-08-01T13:45:00.000Z"
    }]);
    expect(csv).toContain('"Ana Pérez","CUENTA_GOOGLE"');
    expect(csv).toContain('"45"');
  });
});
