import { describe, expect, it } from "vitest";
import {
  auditarSeriesZoom,
  compararAgendaZoom,
  detectarSolapesCuentasZoom,
  type ReunionZoomAuditable
} from "../src/modules/operaciones/zoom-diagnostico.domain";

const reunion = (
  id: string,
  inicio: string,
  fin: string,
  extra: Partial<ReunionZoomAuditable> = {}
): ReunionZoomAuditable => ({
  instanciaId: id,
  solicitudId: "serie-1",
  titulo: "Seminario",
  inicio: new Date(inicio),
  fin: new Date(fin),
  cuentaId: "cuenta-1",
  meetingId: "123456789",
  ...extra
});

describe("diagnóstico Zoom sin cambios de datos", () => {
  it("identifica IDs, cuentas y enlaces faltantes en una serie", () => {
    const reuniones = [
      reunion("a", "2026-11-14T13:00:00Z", "2026-11-14T14:00:00Z"),
      reunion("b", "2026-11-15T13:00:00Z", "2026-11-15T14:00:00Z", {
        cuentaId: "cuenta-2",
        meetingId: "987654321"
      }),
      reunion("c", "2026-11-16T13:00:00Z", "2026-11-16T14:00:00Z", { meetingId: null })
    ];
    expect(auditarSeriesZoom(reuniones)).toMatchObject([
      { motivos: ["SIN_REUNION", "IDS_DISTINTOS", "CUENTAS_DISTINTAS"], encuentros: 3 }
    ]);
    expect(auditarSeriesZoom([reuniones[0]])).toEqual([]);
  });

  it("detecta solapamiento de la misma cuenta y permite horarios contiguos", () => {
    const a = reunion("a", "2026-11-14T13:00:00Z", "2026-11-14T14:00:00Z");
    const b = reunion("b", "2026-11-14T13:30:00Z", "2026-11-14T14:30:00Z", { solicitudId: "serie-2" });
    const c = reunion("c", "2026-11-14T14:30:00Z", "2026-11-14T15:00:00Z");
    expect(detectarSolapesCuentasZoom([c, b, a])).toMatchObject([
      { primera: { instanciaId: "a" }, segunda: { instanciaId: "b" } }
    ]);
  });

  it("contrasta solo los IDs de reuniones locales con el inventario remoto", () => {
    const a = reunion("a", "2026-11-14T13:00:00Z", "2026-11-14T14:00:00Z");
    const b = reunion("b", "2026-11-15T13:00:00Z", "2026-11-15T14:00:00Z", { meetingId: "987654321" });
    expect(
      compararAgendaZoom(
        [a, b],
        [
          { meetingId: "123456789", inicio: null },
          { meetingId: "externa", inicio: null }
        ]
      )
    ).toMatchObject({ verificadas: 1, ausentes: [b] });
  });
});
