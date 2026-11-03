import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estadoEnlaceZoom, resumenEnlaceZoom } from "../src/modules/reuniones/estado-enlace-zoom.domain";

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

describe("estado del enlace Zoom", () => {
  it("es LISTO cuando hay joinUrl", () => {
    expect(estadoEnlaceZoom({ joinUrl: "https://zoom.us/j/1", estadoIntegracion: "SINCRONIZADA", errorIntegracion: null })).toBe("LISTO");
  });

  it("es ERROR sin joinUrl cuando la integración falló", () => {
    expect(estadoEnlaceZoom({ joinUrl: null, estadoIntegracion: "ERROR", errorIntegracion: "Sin sala" })).toBe("ERROR");
  });

  it("es ATENCION cuando hay joinUrl pero la última operación en Zoom falló", () => {
    expect(estadoEnlaceZoom({ joinUrl: "https://zoom.us/j/1", estadoIntegracion: "ERROR", errorIntegracion: "x" })).toBe("ATENCION");
  });

  it("es PENDIENTE sin joinUrl y sin error, o sin evento", () => {
    expect(estadoEnlaceZoom({ joinUrl: null, estadoIntegracion: "PENDIENTE", errorIntegracion: null })).toBe("PENDIENTE");
    expect(estadoEnlaceZoom(null)).toBe("PENDIENTE");
  });
});

describe("resumen del enlace de una instancia", () => {
  const evento = (tipo: string, joinUrl: string | null) => ({
    id: `ev-${tipo}`,
    proveedor: { tipo },
    joinUrl,
    estadoIntegracion: "SINCRONIZADA",
    errorIntegracion: null,
    operacionPendiente: null
  });

  it("usa el enlace Zoom cuando Zoom es el proveedor activo y existe un evento Meet histórico", () => {
    const resumen = resumenEnlaceZoom({
      proveedorActivoTipo: "ZOOM",
      eventosProveedor: [evento("GOOGLE_MEET", "https://meet.google.com/aaa"), evento("ZOOM", "https://zoom.us/j/9")]
    });
    expect(resumen.joinUrl).toBe("https://zoom.us/j/9");
    expect(resumen.eventoProveedorId).toBe("ev-ZOOM");
    expect(resumen.estado).toBe("LISTO");
  });

  it("sin joinUrl no ofrece unirse y propone reintentar la operación pendiente", () => {
    const resumen = resumenEnlaceZoom({
      proveedorActivoTipo: "ZOOM",
      eventosProveedor: [{ ...evento("ZOOM", null), estadoIntegracion: "ERROR", errorIntegracion: "x", operacionPendiente: "PROVISIONAR" }]
    });
    expect(resumen.joinUrl).toBeNull();
    expect(resumen.estado).toBe("ERROR");
    expect(resumen.operacion).toBe("PROVISIONAR");
  });
});

describe("lista de reuniones Zoom", () => {
  it("la ruta apunta a la lista Zoom y la lista de Meet se conserva con su export", () => {
    expect(leer("app/(gestion)/reuniones/page.tsx")).toContain("reuniones-lista-page.server");
    expect(leer("src/bootstrap/ui/reuniones/reuniones-lista-page.server.tsx")).toContain("reuniones-lista-zoom-page.server");
    expect(leer("src/bootstrap/ui/reuniones/reuniones-lista-meet-page.server.tsx")).toContain("export default async function ReunionesPage");
  });

  it("la página Zoom no menciona Google, Meet ni cohosts", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx");
    expect(pagina).not.toMatch(/google|\bmeet\b|cohost/i);
    expect(pagina).toContain("obtenerDatosPaginaReuniones");
  });
});
