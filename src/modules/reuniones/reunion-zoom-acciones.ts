export type ResultadoAccionEncuentro = Readonly<{ ok: boolean; mensaje: string }>;

/** Ejecuta una acción sobre un encuentro y traduce la respuesta de la API a un mensaje para el usuario. */
export async function enviarAccionEncuentro(
  request: typeof fetch,
  url: string,
  init: Readonly<{ method: "PATCH" | "DELETE" | "POST"; body?: unknown }>
): Promise<ResultadoAccionEncuentro> {
  try {
    const response = await request(url, {
      method: init.method,
      ...(init.body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) })
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      warning?: string | null;
    };
    if (!response.ok) {
      return { ok: false, mensaje: result.error ?? "No se pudo completar la acción." };
    }
    return { ok: true, mensaje: result.warning ?? result.message ?? "Listo." };
  } catch {
    return { ok: false, mensaje: "No se pudo completar la acción." };
  }
}
