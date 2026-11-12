import { describe, expect, it } from "vitest";
import {
  claveSerieReunion,
  construirFiltroSerieSolicitud,
  filtroSerieDesdeClave,
  normalizarClaveSerie
} from "../src/modules/reuniones/serie-reunion.domain";

describe("clave de serie y su filtro de consulta", () => {
  it("una serie con identificador se resuelve a ese identificador", () => {
    expect(filtroSerieDesdeClave("serie:abc-123")).toEqual({ serieReunionId: "abc-123" });
  });

  it("una serie antigua se resuelve a docente-programa, título y fecha de creación", () => {
    const solicitud = {
      serieReunionId: null,
      docenteProgramaId: "dp-1",
      titulo: "Seminario",
      createdAt: new Date("2026-10-01T12:00:00.000Z")
    };
    const filtro = filtroSerieDesdeClave(claveSerieReunion(solicitud));
    expect(filtro).toEqual({
      docenteProgramaId: "dp-1",
      titulo: "Seminario",
      createdAt: new Date("2026-10-01T12:00:00.000Z")
    });
    expect(filtro).toEqual(construirFiltroSerieSolicitud(solicitud));
  });

  it("un título con caracteres especiales sobrevive al ida y vuelta", () => {
    const solicitud = {
      docenteProgramaId: "dp-1",
      titulo: "Ñandú: ¿qué «es»? — 100%",
      createdAt: new Date("2026-10-01T12:00:00.000Z")
    };
    expect(filtroSerieDesdeClave(claveSerieReunion(solicitud))).toMatchObject({
      titulo: "Ñandú: ¿qué «es»? — 100%"
    });
  });

  it("una clave inválida no produce filtro", () => {
    expect(filtroSerieDesdeClave("")).toBeNull();
    expect(filtroSerieDesdeClave("serie:")).toBeNull();
    expect(filtroSerieDesdeClave("sin-separadores")).toBeNull();
    expect(filtroSerieDesdeClave("dp-1\u0000titulo\u0000no-es-una-fecha")).toBeNull();
  });
});

describe("la clave de serie se guarda en Postgres, que no admite NUL (22021)", () => {
  const legada = {
    serieReunionId: null,
    docenteProgramaId: "dp-1",
    titulo: "Taller\u0000 Metodológico I | Grupo",
    createdAt: new Date("2026-10-01T12:00:00.000Z")
  };

  it("la clave de una serie antigua nunca contiene NUL ni otros caracteres de control", () => {
    expect(claveSerieReunion(legada)).not.toMatch(/[\u0000-\u001f]/);
    expect(claveSerieReunion({ ...legada, titulo: "Seminario" })).not.toMatch(/[\u0000-\u001f]/);
  });

  it("la clave nueva hace el ida y vuelta, incluso con separadores y NUL dentro del título", () => {
    expect(filtroSerieDesdeClave(claveSerieReunion(legada))).toEqual({
      docenteProgramaId: "dp-1",
      titulo: legada.titulo,
      createdAt: legada.createdAt
    });
  });

  it("sigue entendiendo la clave antigua con NUL que pudo quedar en una pantalla abierta", () => {
    const antigua = "dp-1\u0000Seminario\u00002026-10-01T12:00:00.000Z";
    expect(filtroSerieDesdeClave(antigua)).toEqual({
      docenteProgramaId: "dp-1",
      titulo: "Seminario",
      createdAt: new Date("2026-10-01T12:00:00.000Z")
    });
  });

  it("normalizarClaveSerie convierte la clave antigua en la clave actual y deja intactas las demás", () => {
    const actual = claveSerieReunion({ ...legada, titulo: "Seminario" });
    expect(normalizarClaveSerie("dp-1\u0000Seminario\u00002026-10-01T12:00:00.000Z")).toBe(actual);
    expect(normalizarClaveSerie(actual)).toBe(actual);
    expect(normalizarClaveSerie("serie:abc")).toBe("serie:abc");
    expect(normalizarClaveSerie("sin-forma")).toBe("sin-forma");
  });
});
