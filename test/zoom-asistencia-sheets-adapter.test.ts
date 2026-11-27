/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { crearGoogleZoomAsistenciaSheetsAdapter } from "../src/modules/archivos/infrastructure/google/google-zoom-asistencia-sheets.adapter";

const ENTRADA = {
  titulo: "Clase",
  carpetaId: "carpeta1",
  marcador: "m1",
  resumen: [["Participante"], ["Ana"]],
  sesiones: [["Participante"], ["Ana"]],
};

function crear(
  existentes: Array<{ id: string; webViewLink?: string }> = [],
  hojas = ["Asistencia", "Sesiones"],
) {
  const llamadas: Array<{ url: string; method: string; data?: any }> = [];
  const cliente = {
    request: vi.fn(async (o: any) => {
      llamadas.push(o);
      if (o.method === "GET" && o.url.includes("/drive/")) {
        return { data: { files: existentes } };
      }
      if (o.method === "POST" && o.url.startsWith("https://www.googleapis.com/drive/v3/files")) {
        return { data: { id: "nueva", webViewLink: "https://docs/nueva" } };
      }
      if (o.method === "GET") {
        return { data: { sheets: hojas.map((title) => ({ properties: { title } })) } };
      }
      return { data: {} };
    }),
  };
  return { llamadas, adapter: crearGoogleZoomAsistenciaSheetsAdapter(cliente as any) };
}

describe("planilla de asistencia Zoom en Drive", () => {
  it("crea la planilla directamente en la carpeta destino con unidades compartidas en búsqueda y creación", async () => {
    const { llamadas, adapter } = crear([], []);
    const r = await adapter.crearOActualizar(ENTRADA);
    expect(r).toEqual({ webViewUrl: "https://docs/nueva", creada: true });
    const busqueda = llamadas[0]!;
    expect(busqueda.url).toContain("supportsAllDrives=true");
    expect(busqueda.url).toContain("includeItemsFromAllDrives=true");
    const creacion = llamadas.find(
      (l) => l.method === "POST" && l.url.includes("/drive/v3/files"),
    )!;
    expect(creacion.url).toContain("supportsAllDrives=true");
    expect(creacion.data.parents).toEqual(["carpeta1"]);
    expect(creacion.data.appProperties).toEqual({ zoomAttendanceOperation: "m1" });
    expect(llamadas.some((l) => /addParents|removeParents/.test(l.url))).toBe(false);
  });

  it("actualiza la misma planilla tras conciliar: no crea otra", async () => {
    const { llamadas, adapter } = crear([{ id: "vieja", webViewLink: "https://docs/vieja" }]);
    expect(await adapter.crearOActualizar(ENTRADA)).toEqual({
      webViewUrl: "https://docs/vieja",
      creada: false,
    });
    expect(llamadas.some((l) => l.method === "POST" && l.url.includes("/drive/v3/files"))).toBe(
      false,
    );
    expect(llamadas.some((l) => l.url.includes("vieja/values:batchUpdate"))).toBe(true);
  });

  it("escribe en RAW (sin interpretar fórmulas) y nunca concede permisos", async () => {
    const { llamadas, adapter } = crear();
    await adapter.crearOActualizar(ENTRADA);
    const escritura = llamadas.find((l) => l.url.endsWith("values:batchUpdate"))!;
    expect(escritura.data.valueInputOption).toBe("RAW");
    expect(llamadas.some((l) => /permissions/.test(l.url))).toBe(false);
    expect(JSON.stringify(llamadas)).not.toMatch(/"anyone"|type":"anyone/);
  });

  it("dos planillas con el mismo marcador: error explícito, no se elige una al azar", async () => {
    const { adapter } = crear([{ id: "a" }, { id: "b" }]);
    await expect(adapter.crearOActualizar(ENTRADA)).rejects.toThrow();
  });

  it("agrega las pestañas que falten", async () => {
    const { llamadas, adapter } = crear([{ id: "vieja" }], ["Hoja 1"]);
    await adapter.crearOActualizar(ENTRADA);
    const alta = llamadas.find((l) => l.url.endsWith(":batchUpdate"))!;
    expect(alta.data.requests).toHaveLength(2);
  });
});
