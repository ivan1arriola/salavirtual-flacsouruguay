import { describe, expect, it } from "vitest";
import {
  elegirProveedorDetalle,
  filtroProveedorActivo,
  proveedorActivoDeInstancia,
  resolverProveedorReunion
} from "../src/modules/reuniones/proveedor-reunion.domain";

const evento = (tipo: string) => ({ proveedor: { tipo } });

describe("proveedor de una reunión", () => {
  it("interpreta el parámetro de la URL", () => {
    expect(resolverProveedorReunion("meet")).toBe("GOOGLE_MEET");
    expect(resolverProveedorReunion("zoom")).toBe("ZOOM");
    expect(resolverProveedorReunion("otro")).toBeNull();
    expect(resolverProveedorReunion(undefined)).toBeNull();
  });

  it("usa el proveedor activo explícito aunque exista el otro evento", () => {
    expect(proveedorActivoDeInstancia({ proveedorActivoTipo: "ZOOM", eventosProveedor: [evento("GOOGLE_MEET"), evento("ZOOM")] })).toBe("ZOOM");
    expect(proveedorActivoDeInstancia({ proveedorActivoTipo: "GOOGLE_MEET", eventosProveedor: [evento("ZOOM"), evento("GOOGLE_MEET")] })).toBe("GOOGLE_MEET");
  });

  it("en datos antiguos sin proveedor activo, una reunión con Meet sigue siendo de Meet", () => {
    expect(proveedorActivoDeInstancia({ proveedorActivoTipo: null, eventosProveedor: [evento("ZOOM"), evento("GOOGLE_MEET")] })).toBe("GOOGLE_MEET");
  });

  it("sin proveedor activo y sin evento Meet, o sin eventos, es de Zoom", () => {
    expect(proveedorActivoDeInstancia({ proveedorActivoTipo: null, eventosProveedor: [evento("ZOOM")] })).toBe("ZOOM");
    expect(proveedorActivoDeInstancia({ proveedorActivoTipo: null, eventosProveedor: [] })).toBe("ZOOM");
  });
});

describe("filtro de consulta por proveedor activo", () => {
  it("Meet y Zoom son complementarios: ninguna instancia queda fuera ni en las dos", () => {
    const meet = JSON.stringify(filtroProveedorActivo("GOOGLE_MEET"));
    const zoom = JSON.stringify(filtroProveedorActivo("ZOOM"));
    expect(meet).toContain('"proveedorActivoTipo":"GOOGLE_MEET"');
    expect(meet).toContain('"some"');
    expect(zoom).toContain('"proveedorActivoTipo":"ZOOM"');
    expect(zoom).toContain('"none"');
    expect(meet).not.toBe(zoom);
  });
});

describe("qué panel abre el detalle de una reunión", () => {
  const ahora = new Date("2026-11-10T12:00:00Z");
  const dia = (n: number) => new Date(ahora.getTime() + n * 24 * 60 * 60 * 1000);
  const enc = (n: number, proveedor: "GOOGLE_MEET" | "ZOOM", estado = "PROGRAMADA") => ({
    estado,
    inicioProgramadoAt: dia(n),
    finProgramadoAt: new Date(dia(n).getTime() + 60 * 60 * 1000),
    proveedor
  });

  it("abre el proveedor del próximo encuentro y avisa que hay otro", () => {
    const r = elegirProveedorDetalle([enc(-3, "GOOGLE_MEET"), enc(2, "ZOOM"), enc(9, "ZOOM")], ahora, null);
    expect(r.proveedor).toBe("ZOOM");
    expect(r.otro).toEqual({ proveedor: "GOOGLE_MEET", cantidad: 1 });
  });

  it("respeta el proveedor pedido si tiene encuentros", () => {
    const r = elegirProveedorDetalle([enc(-3, "GOOGLE_MEET"), enc(2, "ZOOM")], ahora, "GOOGLE_MEET");
    expect(r.proveedor).toBe("GOOGLE_MEET");
    expect(r.otro).toEqual({ proveedor: "ZOOM", cantidad: 1 });
  });

  it("ignora el proveedor pedido si no tiene encuentros", () => {
    const r = elegirProveedorDetalle([enc(2, "ZOOM")], ahora, "GOOGLE_MEET");
    expect(r.proveedor).toBe("ZOOM");
    expect(r.otro).toBeNull();
  });

  it("sin próximos encuentros abre el proveedor del último", () => {
    const r = elegirProveedorDetalle([enc(-9, "ZOOM"), enc(-3, "GOOGLE_MEET")], ahora, null);
    expect(r.proveedor).toBe("GOOGLE_MEET");
  });

  it("no cuenta los encuentros cancelados", () => {
    const r = elegirProveedorDetalle([enc(2, "ZOOM"), enc(4, "GOOGLE_MEET", "CANCELADA")], ahora, null);
    expect(r.proveedor).toBe("ZOOM");
    expect(r.otro).toBeNull();
  });

  it("una serie sin encuentros abre Zoom", () => {
    expect(elegirProveedorDetalle([], ahora, null)).toEqual({ proveedor: "ZOOM", otro: null });
  });
});
