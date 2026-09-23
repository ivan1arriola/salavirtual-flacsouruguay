import { describe, expect, it } from "vitest";
import { readMeetEvidence, evidenceMatches, type MeetAudit } from "../src/modules/conferencias/api";
const base: MeetAudit = {
  id: "audit", accion: "MEET_MIGRADO_A_ESPACIO_PREVIEW", entidadTipo: "InstanciaSala",
  entidadId: "m1", valorAnterior: { codigoReunion: "rsf-wtgp-uxt" },
  valorNuevo: { joinUrl: "https://meet.google.com/jgw-boaw-dgr?authuser=1" }, createdAt: new Date(),
};
describe("evidencia histórica", () => {
  it("recupera una migración demostrada", () => {
    const result = readMeetEvidence(base)!;
    expect(result.meetingIds).toEqual(["m1"]);
    expect(result.change.before).toEqual(["rsf-wtgp-uxt"]);
    expect(result.change.after).toEqual(["jgw-boaw-dgr"]);
    expect(evidenceMatches(result.change, "rsf-wtgp-uxt")).toBe(true);
    expect(evidenceMatches(result.change, "jgw-boaw-dgr")).toBe(true);
    expect(evidenceMatches(result.change, "aaa-bbbb-ccc")).toBe(false);
  });
  it("recupera solo IDs demostrados en ambos lados del grupo", () => {
    const result = readMeetEvidence({ ...base, accion: "MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW",
      valorAnterior: { codigoReunion: "rsf-wtgp-uxt", encuentros: ["m1", "m2", "ambiguo", 7] },
      valorNuevo: { codigoReunion: "jgw-boaw-dgr", encuentros: ["m1", "m2"] },
    })!;
    expect(result.meetingIds).toEqual(["m1", "m2"]);
  });
  it.each(["ENLACE_MEET_UNIFICADO_EN_SERIE", "ENLACE_MEET_ASIGNADO_A_SERIE"])("no inventa encuentros: %s", (accion) => {
    const result = readMeetEvidence({ ...base, accion, entidadTipo: "SolicitudSala",
      valorAnterior: { codigosMeet: ["rsf-wtgp-uxt", "inválido"] }, valorNuevo: { codigoMeet: "jgw-boaw-dgr" },
    })!;
    expect(result.meetingIds).toEqual([]);
    expect(result.seriesId).toBe("m1");
    expect(result.change.before).toEqual(["rsf-wtgp-uxt"]);
    expect(result.change.reason).toBeTruthy();
  });
  it("lee altas, cambios y bajas capturados por el trigger sin inventar fechas de inicio", () => {
    const result = readMeetEvidence({ ...base, accion: "ENLACE_MEET_REGISTRADO", entidadTipo: "EventoProveedor",
      valorNuevo: { instanciaSalaId: "m2", origen: "script", motivo: "Corrección", joinUrl: null },
    })!;
    expect(result.meetingIds).toEqual(["m2"]);
    expect(result.change.after).toEqual([]);
    expect(result.change.reason).toBe("Corrección");
    expect(result.change.origin).toBe("script");
    expect(readMeetEvidence({ ...base, accion: "ENLACE_MEET_REGISTRADO", entidadTipo: "EventoProveedor",
      valorAnterior: null, valorNuevo: { instanciaSalaId: "m1", codigoReunion: "jgw-boaw-dgr" } })?.change.reason).toBeNull();
  });
  it("ignora datos ajenos o inválidos", () => {
    expect(readMeetEvidence({ ...base, accion: "LOGIN" })).toBeNull();
    expect(readMeetEvidence({ ...base, valorAnterior: [], valorNuevo: null })).toBeNull();
    for (const [accion, entidadTipo] of [
      ["ENLACE_MEET_REGISTRADO", "Usuario"], ["MEET_MIGRADO_A_ESPACIO_PREVIEW", "Usuario"],
      ["MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW", "Usuario"], ["ENLACE_MEET_UNIFICADO_EN_SERIE", "Usuario"],
    ]) expect(readMeetEvidence({ ...base, accion, entidadTipo })).toBeNull();
  });
});
