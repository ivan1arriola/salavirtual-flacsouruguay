/** Llamadas del navegador para conciliar ejecuciones pasadas de Zoom; sin React, para poder probarlas. */
export type ResultadoAccionZoom = Readonly<{ ok: boolean; mensaje: string }>;

export function mensajeErrorZoom(status: number): string {
  if (status === 403) {
    return "Solo administración puede hacer esta acción.";
  }
  if (status === 404) {
    return "No se encontró el recurso solicitado.";
  }
  if (status === 409) {
    return "No se pudo completar: el estado o vínculo cambió. Actualizá la página.";
  }
  return "No se pudo completar la operación.";
}

async function enviar(url: string, cuerpo: unknown, exito: string): Promise<ResultadoAccionZoom> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    });
    return r.ok ? { ok: true, mensaje: exito } : { ok: false, mensaje: mensajeErrorZoom(r.status) };
  } catch {
    return { ok: false, mensaje: "No se pudo conectar. Intentá de nuevo." };
  }
}

export const desvincularOcurrenciaZoomCliente = (ocurrenciaId: string, eventoId: string) =>
  enviar(
    `/api/v1/archivos/zoom/ocurrencias/${encodeURIComponent(ocurrenciaId)}/desvincular`,
    { eventoId },
    "Vínculo deshecho."
  );

export const reintentarAsistenciaZoomCliente = (instanciaId: string) =>
  enviar(
    `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/regenerar`,
    {},
    "Asistencia recalculada."
  );
