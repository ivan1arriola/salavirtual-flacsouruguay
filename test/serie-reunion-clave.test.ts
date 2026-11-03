import { describe, expect, it } from "vitest";
import {
  claveSerieReunion,
  construirFiltroSerieSolicitud,
  filtroSerieDesdeClave
} from "../src/modules/reuniones/serie-reunion.domain";

describe("clave de serie y su filtro de consulta", () => {
  it("una serie con identificador se resuelve a ese identificador", () => {
    expect(filtroSerieDesdeClave("serie:abc-123")).toEqual({ serieReunionId: "abc-123" });
  });

  it("una serie antigua se resuelve a docente-programa, título y fecha de creación", () => {
    const solicitud = { serieReunionId: null, docenteProgramaId: "dp-1", titulo: "Seminario", createdAt: new Date("2026-10-01T12:00:00.000Z") };
    const filtro = filtroSerieDesdeClave(claveSerieReunion(solicitud));
    expect(filtro).toEqual({ docenteProgramaId: "dp-1", titulo: "Seminario", createdAt: new Date("2026-10-01T12:00:00.000Z") });
    expect(filtro).toEqual(construirFiltroSerieSolicitud(solicitud));
  });

  it("un título con caracteres especiales sobrevive al ida y vuelta", () => {
    const solicitud = { docenteProgramaId: "dp-1", titulo: "Ñandú: ¿qué «es»? — 100%", createdAt: new Date("2026-10-01T12:00:00.000Z") };
    expect(filtroSerieDesdeClave(claveSerieReunion(solicitud))).toMatchObject({ titulo: "Ñandú: ¿qué «es»? — 100%" });
  });

  it("una clave inválida no produce filtro", () => {
    expect(filtroSerieDesdeClave("")).toBeNull();
    expect(filtroSerieDesdeClave("serie:")).toBeNull();
    expect(filtroSerieDesdeClave("sin-separadores")).toBeNull();
    expect(filtroSerieDesdeClave("dp-1\u0000titulo\u0000no-es-una-fecha")).toBeNull();
  });
});
