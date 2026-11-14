import { describe, expect, it } from "vitest";
import {
  agruparActividadPorEncuentro,
  agruparAvisosPorReunionYHorario,
  uuidsDeOcurrenciasZoom
} from "../src/modules/reuniones/uuids-ocurrencias-zoom.domain";

describe("UUID de una reunión Zoom", () => {
  it("incluye todas las ejecuciones vinculadas y deduplica el valor antiguo", () => {
    expect(uuidsDeOcurrenciasZoom([{ uuid: "primera" }, { uuid: "segunda" }], "primera")).toEqual([
      "primera",
      "segunda"
    ]);
  });
  it("conserva el valor antiguo si no hay ejecuciones y devuelve vacío si no hay datos", () => {
    expect(uuidsDeOcurrenciasZoom([], "antiguo")).toEqual(["antiguo"]);
    expect(uuidsDeOcurrenciasZoom([], null)).toEqual([]);
  });
});

describe("actividad agrupada por encuentro", () => {
  const ocurrencias = [
    { eventoProveedorId: "e1", cuentaZoomId: "c", uuid: "u1" },
    { eventoProveedorId: "e1", cuentaZoomId: "c", uuid: "u1b" },
    { eventoProveedorId: "e2", cuentaZoomId: "c", uuid: "u2" }
  ];
  const ev = (tipo: string, uuid: string | null, uuids: string[] = [], cuentaZoomId = "c", min = 0) => ({
    tipo,
    cuentaZoomId,
    uuid,
    uuids,
    ocurridoAt: new Date(Date.UTC(2026, 10, 10, 12, 0) - min * 60_000)
  });

  it("asigna cada aviso a su encuentro por UUID propio o por lote, sin mezclar cuentas", () => {
    const r = agruparActividadPorEncuentro(
      ocurrencias,
      [
        ev("a", "u1"),
        ev("b", null, ["u2", "otro"]),
        ev("c", "u2", [], "otra-cuenta"),
        ev("d", "desconocido")
      ],
      10
    );
    expect(r.get("e1")?.map((x) => x.tipo)).toEqual(["a"]);
    expect(r.get("e2")?.map((x) => x.tipo)).toEqual(["b"]);
  });

  it("un aviso que coincide por dos claves del mismo encuentro cuenta una vez", () => {
    const r = agruparActividadPorEncuentro(ocurrencias, [ev("a", "u1", ["u1b"])], 10);
    expect(r.get("e1")).toHaveLength(1);
  });

  it("limita por encuentro conservando los más recientes primero (no un tope global)", () => {
    const eventos = [
      ...Array.from({ length: 5 }, (_, i) => ev(`nuevo${i}`, "u2", [], "c", i)),
      ev("viejo", "u1", [], "c", 500)
    ];
    const r = agruparActividadPorEncuentro(ocurrencias, eventos, 3);
    expect(r.get("e2")).toHaveLength(3);
    expect(r.get("e1")?.map((x) => x.tipo)).toEqual(["viejo"]);
  });
});

describe("avisos por número de reunión y horario (encuentros sin UUID)", () => {
  const H = 3_600_000;
  const base = Date.UTC(2026, 10, 10, 12, 0);
  const enc = (id: string, meetingId: string, desdeH: number, duracionH = 1) => ({
    eventoProveedorId: id,
    meetingId,
    inicio: new Date(base + desdeH * H),
    fin: new Date(base + (desdeH + duracionH) * H)
  });
  const av = (tipo: string, recursoId: string | null, horasDesdeBase: number) => ({
    tipo,
    recursoId,
    ocurridoAt: new Date(base + horasDesdeBase * H)
  });

  it("asocia avisos del mismo número de reunión dentro del horario del encuentro", () => {
    const r = agruparAvisosPorReunionYHorario(
      [enc("e1", "123", 0)],
      [av("a", "123", 0.5), av("b", "999", 0.5)],
      10
    );
    expect(r.get("e1")?.map((x) => x.tipo)).toEqual(["a"]);
  });

  it("admite inicio anticipado (45 min) y avisos posteriores como la grabación terminada", () => {
    const r = agruparAvisosPorReunionYHorario(
      [enc("e1", "123", 0)],
      [av("antes", "123", -0.5), av("tarde", "123", 4), av("muy-antes", "123", -2)],
      10
    );
    expect(r.get("e1")?.map((x) => x.tipo)).toEqual(["antes", "tarde"]);
  });

  it("en una serie con el mismo número, un aviso cae solo en su encuentro y no en el siguiente", () => {
    const r = agruparAvisosPorReunionYHorario(
      [enc("e1", "123", 0), enc("e2", "123", 3)],
      [av("de-e1", "123", 1.5), av("de-e2", "123", 3.5)],
      10
    );
    expect(r.get("e1")?.map((x) => x.tipo)).toEqual(["de-e1"]);
    expect(r.get("e2")?.map((x) => x.tipo)).toEqual(["de-e2"]);
  });

  it("ignora avisos sin número de reunión", () => {
    expect(agruparAvisosPorReunionYHorario([enc("e1", "123", 0)], [av("a", null, 0.5)], 10).size).toBe(0);
  });
});
