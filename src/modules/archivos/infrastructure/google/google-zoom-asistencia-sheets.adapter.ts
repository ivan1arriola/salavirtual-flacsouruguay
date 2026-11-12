import type { PlanillasAsistenciaZoomPort } from "../../ports";

/** Lo mínimo que se usa de `JWT` de google-auth-library: permite probar sin red. */
export type ClienteGoogleRequest = Readonly<{
  request<T = unknown>(opciones: { url: string; method: string; data?: unknown }): Promise<{ data: T }>;
}>;

const MIME_HOJA = "application/vnd.google-apps.spreadsheet";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
/** Propiedad propia de Zoom: no se mezcla con la de Meet (`meetAttendanceOperation`). */
const PROPIEDAD_MARCADOR = "zoomAttendanceOperation";
const PESTANAS = ["Asistencia", "Sesiones"] as const;
const COMPARTIDAS = "supportsAllDrives=true";

const escaparConsulta = (v: string) => v.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

/**
 * Planilla de Drive de la asistencia Zoom, para administración. Se crea directamente en la carpeta destino
 * (nunca en la raíz para moverla después) y no concede permisos: ni "anyone" ni por correo. Los docentes y
 * asistentes consultan la asistencia en Sala Virtual, no en Drive.
 */
export function crearGoogleZoomAsistenciaSheetsAdapter(
  cliente: ClienteGoogleRequest
): PlanillasAsistenciaZoomPort {
  async function buscar(marcador: string, carpetaId: string) {
    const q =
      `appProperties has { key='${PROPIEDAD_MARCADOR}' and value='${escaparConsulta(marcador)}' } ` +
      `and '${escaparConsulta(carpetaId)}' in parents and mimeType = '${MIME_HOJA}' and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: "files(id,webViewLink)",
      pageSize: "10",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });
    const r = await cliente.request<{ files?: Array<{ id: string; webViewLink?: string }> }>({
      url: `${DRIVE}?${params}`,
      method: "GET"
    });
    const archivos = r.data.files ?? [];
    // Dos planillas para la misma ocurrencia es una ambigüedad: no se elige una al azar.
    if (archivos.length > 1) {
      throw Object.assign(new Error("PLANILLA_DUPLICADA"), { name: "PlanillaDuplicada" });
    }
    return archivos[0] ?? null;
  }

  const celdas = (filas: readonly (readonly (string | number)[])[]) => filas.map((fila) => [...fila]);

  return {
    async crearOActualizar({ titulo, carpetaId, marcador, resumen, sesiones }) {
      const existente = await buscar(marcador, carpetaId);
      const creado = existente
        ? null
        : (
            await cliente.request<{ id: string; webViewLink?: string }>({
              url: `${DRIVE}?${COMPARTIDAS}&fields=id,webViewLink`,
              method: "POST",
              data: {
                name: titulo,
                mimeType: MIME_HOJA,
                parents: [carpetaId],
                appProperties: { [PROPIEDAD_MARCADOR]: marcador }
              }
            })
          ).data;
      const id = (existente ?? creado)!.id;

      // Dos pestañas fijas: se asegura su existencia antes de escribir, de forma idempotente.
      const actual = await cliente.request<{ sheets?: Array<{ properties?: { title?: string } }> }>({
        url: `${SHEETS}/${encodeURIComponent(id)}?fields=sheets(properties(title))`,
        method: "GET"
      });
      const titulos = (actual.data.sheets ?? []).map((s) => s.properties?.title);
      const faltantes = PESTANAS.filter((p) => !titulos.includes(p));
      if (faltantes.length > 0) {
        await cliente.request({
          url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`,
          method: "POST",
          data: { requests: faltantes.map((title) => ({ addSheet: { properties: { title } } })) }
        });
      }

      const rangos = [
        { range: `'${PESTANAS[0]}'!A1:Z50000`, values: celdas(resumen) },
        { range: `'${PESTANAS[1]}'!A1:Z50000`, values: celdas(sesiones) }
      ];
      await cliente.request({
        url: `${SHEETS}/${encodeURIComponent(id)}/values:batchClear`,
        method: "POST",
        data: { ranges: rangos.map((r) => r.range) }
      });
      // RAW: ningún valor se interpreta como fórmula, además del escape previo de nombres y correos externos.
      await cliente.request({
        url: `${SHEETS}/${encodeURIComponent(id)}/values:batchUpdate`,
        method: "POST",
        data: { valueInputOption: "RAW", data: rangos }
      });
      return {
        webViewUrl: existente?.webViewLink ?? creado?.webViewLink ?? null,
        creada: existente === null
      };
    }
  };
}
