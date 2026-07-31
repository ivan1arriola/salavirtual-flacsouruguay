export type WorkspaceSection = "CREDENCIAL" | "DELEGACION" | "DRIVE" | "ESTADO";
export type WorkspaceTestTarget = Exclude<WorkspaceSection, "ESTADO">;

type ApiResult = Readonly<{ ok: boolean; message: string }>;

export async function saveWorkspaceSection(
  payload: Readonly<Record<string, unknown>>
): Promise<ApiResult> {
  return requestWorkspace("/api/v1/configuracion/google-workspace", {
    method: "PUT",
    body: JSON.stringify(payload)
  }, "Configuración guardada.");
}

export async function testWorkspaceSection(
  objetivo: WorkspaceTestTarget
): Promise<ApiResult> {
  return requestWorkspace("/api/v1/configuracion/google-workspace/test", {
    method: "POST",
    body: JSON.stringify({ objetivo })
  }, "Prueba completada.");
}

async function requestWorkspace(
  url: string,
  init: RequestInit,
  fallback: string
): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      message: response.ok
        ? result.message ?? fallback
        : result.error ?? "No se pudo completar la operación."
    };
  } catch {
    return { ok: false, message: "No se pudo conectar con el servidor." };
  }
}
