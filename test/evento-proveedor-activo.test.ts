import { describe, expect, it } from "vitest";
import { seleccionarEventoProveedorActivo } from "../src/modules/reuniones/evento-proveedor-activo.domain";

const meet = { id: "meet-1", proveedor: { tipo: "GOOGLE_MEET" }, joinUrl: "https://meet.google.com/abc-defg-hij" };
const zoom = { id: "zoom-1", proveedor: { tipo: "ZOOM" }, joinUrl: "https://zoom.us/j/123" };
const historico = { id: "historico-1", proveedor: { tipo: "ZOOM_HISTORICO" }, joinUrl: "https://zoom.us/j/old" };

describe("seleccionarEventoProveedorActivo", () => {
  it("conserva Meet como proveedor de un encuentro anterior sin marca explícita", () => {
    expect(seleccionarEventoProveedorActivo({ eventosProveedor: [meet] })).toBe(meet);
  });

  it("selecciona Zoom para un encuentro nuevo explícitamente Zoom", () => {
    expect(seleccionarEventoProveedorActivo({ proveedorActivoTipo: "ZOOM", eventosProveedor: [zoom] })).toBe(zoom);
  });

  it("respeta el proveedor explícito cuando conviven ambos eventos", () => {
    expect(seleccionarEventoProveedorActivo({ proveedorActivoTipo: "ZOOM", eventosProveedor: [meet, zoom] })).toBe(zoom);
    expect(seleccionarEventoProveedorActivo({ proveedorActivoTipo: "GOOGLE_MEET", eventosProveedor: [zoom, meet] })).toBe(meet);
  });

  it("mantiene Meet durante la preparación de Zoom en un encuentro antiguo", () => {
    expect(seleccionarEventoProveedorActivo({ eventosProveedor: [zoom, meet] })).toBe(meet);
  });

  it("no recurre a Meet si Zoom es explícito pero su evento falta", () => {
    expect(seleccionarEventoProveedorActivo({ proveedorActivoTipo: "ZOOM", eventosProveedor: [meet] })).toBeNull();
  });

  it("no presenta Zoom histórico como acceso de un encuentro activo", () => {
    expect(seleccionarEventoProveedorActivo({ eventosProveedor: [historico] })).toBeNull();
  });
});
