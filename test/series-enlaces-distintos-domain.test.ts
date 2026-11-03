import { describe, expect, it } from "vitest";
import { evaluarEnlacesDeSerie, type EncuentroEnlaceSerie } from "../src/modules/reuniones/series-enlaces-distintos.domain";

const ahora = new Date("2026-11-03T12:00:00Z");
const dia = (n: number) => new Date(ahora.getTime() + n * 86_400_000);
const enc = (n: number, extra: Partial<EncuentroEnlaceSerie> = {}): EncuentroEnlaceSerie => ({
  instanciaId: `i${n}`, inicio: dia(n), estado: "PROGRAMADA", proveedor: "ZOOM",
  joinUrl: `https://zoom.us/j/${n}`, externalEventId: `${n}`, cuentaProveedorId: "c1", reunionProveedorId: null, ...extra,
});

describe("evaluarEnlacesDeSerie", () => {
  it("detecta una serie con enlaces distintos", () => {
    const r = evaluarEnlacesDeSerie([enc(1), enc(2), enc(3)], ahora);
    expect(r).toMatchObject({ necesitaCorreccion: true, enlacesDistintos: 3, encuentrosZoom: 3 });
  });
  it("detecta cuentas distintas aunque el enlace sea el mismo", () => {
    const mismo = { joinUrl: "https://zoom.us/j/9" };
    expect(evaluarEnlacesDeSerie([enc(1, { ...mismo, cuentaProveedorId: "c1" }), enc(2, { ...mismo, cuentaProveedorId: "c2" })], ahora).necesitaCorreccion).toBe(true);
  });
  it("no marca una serie con el mismo enlace y cuenta", () => {
    const mismo = { joinUrl: "https://zoom.us/j/9" };
    expect(evaluarEnlacesDeSerie([enc(1, mismo), enc(2, mismo)], ahora).necesitaCorreccion).toBe(false);
  });
  it("no cuenta cancelados ni pasados", () => {
    const r = evaluarEnlacesDeSerie([enc(1), enc(2, { estado: "CANCELADA" }), enc(-3)], ahora);
    expect(r).toMatchObject({ necesitaCorreccion: false, encuentrosZoom: 1 });
  });
  it("una serie ya unificada en una reunión compartida no se corrige", () => {
    const r = evaluarEnlacesDeSerie([enc(1, { reunionProveedorId: "r" }), enc(2, { reunionProveedorId: "r" })], ahora);
    expect(r).toMatchObject({ unificada: true, necesitaCorreccion: false });
  });
  it("una serie mixta (Meet y Zoom) se informa pero no se corrige", () => {
    const r = evaluarEnlacesDeSerie([enc(1), enc(2, { proveedor: "GOOGLE_MEET" })], ahora);
    expect(r).toMatchObject({ mixta: true, necesitaCorreccion: false });
  });
});
