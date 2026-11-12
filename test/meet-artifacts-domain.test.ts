import { describe, expect, it } from "vitest";
import {
  asistenciaMeetCompleta,
  crearHtmlAsistencia,
  elegirConferenciaMeet,
  etiquetaTipoArtefactoMeet,
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

  it("expone etiquetas legibles para todos los tipos visibles", () => {
    expect(etiquetaTipoArtefactoMeet("GRABACION")).toBe("Grabación");
    expect(etiquetaTipoArtefactoMeet("TRANSCRIPCION")).toBe("Transcripción");
    expect(etiquetaTipoArtefactoMeet("LISTA_ASISTENCIA")).toBe("Asistencia");
    expect(etiquetaTipoArtefactoMeet("NOTAS")).toBe("Notas de Meet");
    expect(etiquetaTipoArtefactoMeet("OTRO")).toBe("Archivo");
  });

  it("nombra archivos por fecha, codigo, tipo, bloque y titulo", () => {
    expect(
      nombreArchivoReunion({
        ...meeting,
        codigoReunion: "abc-defg-hij",
        tipo: "GRABACION",
        indice: 2,
        extension: ".MP4"
      })
    ).toBe("20260801_abc-defg-hij_video_02_Diploma---Salud-Mental.mp4");
  });

  it("genera la asistencia como documento importable a Google Docs", () => {
    const html = crearHtmlAsistencia([
      {
        nombre: "Ana <Pérez>",
        tipo: "CUENTA_GOOGLE",
        inicio: "2026-08-01T13:00:00.000Z",
        fin: "2026-08-01T13:45:00.000Z"
      }
    ]);

    expect(html).toContain("<table>");
    expect(html).toContain("Ana &lt;Pérez&gt;");
    expect(html).toContain("<td>45</td>");
  });

  it("prefiere el registro de conferencia que se superpone con el horario programado", () => {
    const inicio = new Date("2026-08-01T18:00:00.000Z");
    const fin = new Date("2026-08-01T19:00:00.000Z");
    const selected = elegirConferenciaMeet(
      [
        {
          name: "conferenceRecords/anterior",
          startTime: "2026-08-01T17:40:00.000Z",
          endTime: "2026-08-01T17:55:00.000Z"
        },
        {
          name: "conferenceRecords/correcta",
          startTime: "2026-08-01T18:05:00.000Z",
          endTime: "2026-08-01T18:50:00.000Z"
        }
      ],
      inicio,
      fin
    );

    expect(selected?.name).toBe("conferenceRecords/correcta");
  });

  it("usa la conferencia más cercana si ninguna se superpone y soporta una conferencia activa", () => {
    const inicio = new Date("2026-08-01T18:00:00.000Z");
    const fin = new Date("2026-08-01T19:00:00.000Z");
    expect(elegirConferenciaMeet([], inicio, fin)).toBeNull();
    expect(
      elegirConferenciaMeet(
        [
          {
            name: "conferenceRecords/lejana",
            startTime: "2026-08-01T12:00:00.000Z",
            endTime: "2026-08-01T13:00:00.000Z"
          },
          {
            name: "conferenceRecords/cercana",
            startTime: "2026-08-01T19:30:00.000Z",
            endTime: "2026-08-01T20:00:00.000Z"
          }
        ],
        inicio,
        fin
      )?.name
    ).toBe("conferenceRecords/cercana");
    expect(
      elegirConferenciaMeet(
        [{ name: "conferenceRecords/activa", startTime: "2026-08-01T18:15:00.000Z" }],
        inicio,
        fin
      )?.name
    ).toBe("conferenceRecords/activa");
  });

  it("prioriza la clase de mayor duración y solapamiento sobre una prueba corta antes del inicio", () => {
    const inicio = new Date("2026-08-01T18:00:00.000Z");
    const fin = new Date("2026-08-01T20:00:00.000Z");
    const selected = elegirConferenciaMeet(
      [
        {
          name: "conferenceRecords/prueba-corta",
          startTime: "2026-08-01T17:58:00.000Z", // 2 min antes del horario
          endTime: "2026-08-01T18:01:00.000Z" // duró 3 min (solapa 1 min)
        },
        {
          name: "conferenceRecords/clase-real",
          startTime: "2026-08-01T18:04:00.000Z", // 4 min después del horario
          endTime: "2026-08-01T20:05:00.000Z" // duró 2h 1m (solapa 1h 56m)
        }
      ],
      inicio,
      fin
    );

    expect(selected?.name).toBe("conferenceRecords/clase-real");
  });

  it("solo considera completa la asistencia cuando cada participante tiene sesiones cerradas", () => {
    expect(asistenciaMeetCompleta([])).toBe(false);
    expect(asistenciaMeetCompleta([[]])).toBe(false);
    expect(asistenciaMeetCompleta([[{ startTime: "2026-08-01T18:00:00Z" }]])).toBe(false);
    expect(
      asistenciaMeetCompleta([
        [
          { startTime: "2026-08-01T18:00:00Z", endTime: "2026-08-01T18:30:00Z" },
          { startTime: "2026-08-01T18:40:00Z", endTime: "2026-08-01T19:00:00Z" }
        ]
      ])
    ).toBe(true);
    // Si la conferencia ya finalizó, acepta participantes con sesiones para consolidar
    expect(asistenciaMeetCompleta([[{ startTime: "2026-08-01T18:00:00Z" }]], true)).toBe(true);
  });
});
