export type WorkspaceSection = "CREDENCIAL" | "DELEGACION" | "DRIVE" | "ESTADO";
export type WorkspaceTestTarget = Exclude<WorkspaceSection, "ESTADO">;

type ApiResult = Readonly<{ ok: boolean; message: string }>;

export type WorkspaceScopeValidation = Readonly<{
  key:
    | "calendar.events"
    | "drive"
    | "meetings.space.settings"
    | "meetings.space.readonly"
    | "meetings.space.created"
    | "gmail.send";
  label: string;
  scope: string;
  autorizado: boolean;
  error?: string;
}>;

export type WorkspaceScopeAccountValidation = Readonly<{
  subject: string;
  tipo: "GENERAL" | "SALA";
  activa: boolean;
  ok: boolean;
  scopes: readonly WorkspaceScopeValidation[];
}>;

export type WorkspaceScopesResult = Readonly<{
  ok: boolean;
  message: string;
  accounts: readonly WorkspaceScopeAccountValidation[];
}>;

export async function saveWorkspaceSection(payload: Readonly<Record<string, unknown>>): Promise<ApiResult> {
  return requestWorkspace(
    "/api/v1/configuracion/google-workspace",
    {
      method: "PUT",
      body: JSON.stringify(payload)
    },
    "Configuración guardada."
  );
}

export async function testWorkspaceSection(objetivo: WorkspaceTestTarget): Promise<ApiResult> {
  return requestWorkspace(
    "/api/v1/configuracion/google-workspace/test",
    {
      method: "POST",
      body: JSON.stringify({ objetivo })
    },
    "Prueba completada."
  );
}

export async function testWorkspaceCredential(credentialId: string): Promise<ApiResult> {
  return requestWorkspace(
    "/api/v1/configuracion/google-workspace/test",
    {
      method: "POST",
      body: JSON.stringify({ objetivo: "CREDENCIAL", credentialId })
    },
    "Credencial válida."
  );
}

export async function validateWorkspaceScopes(): Promise<WorkspaceScopesResult> {
  try {
    const response = await fetch("/api/v1/configuracion/google-workspace/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: "SCOPES" })
    });
    const result = await response.json().catch(() => ({}));
    const accounts = Array.isArray(result.accounts)
      ? (result.accounts as readonly WorkspaceScopeAccountValidation[])
      : legacyScopeAccounts(result);
    return {
      ok: response.ok && accounts.length > 0 && accounts.every(({ ok }) => ok),
      message: response.ok
        ? (result.message ?? "Validación de scopes completada.")
        : (result.error ?? "No se pudieron validar los scopes."),
      accounts
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo conectar con el servidor.",
      accounts: []
    };
  }
}

function legacyScopeAccounts(result: Record<string, unknown>): readonly WorkspaceScopeAccountValidation[] {
  if (typeof result.subject !== "string" || !Array.isArray(result.scopes)) {
    return [];
  }
  const scopes = result.scopes as readonly WorkspaceScopeValidation[];
  return [
    {
      subject: result.subject,
      tipo: "SALA",
      activa: true,
      ok: scopes.length > 0 && scopes.every(({ autorizado }) => autorizado),
      scopes
    }
  ];
}

export async function prepareDriveHostAccess(): Promise<ApiResult> {
  return requestWorkspace(
    "/api/v1/configuracion/google-workspace/drive-access",
    {
      method: "POST"
    },
    "Acceso de las salas preparado."
  );
}

async function requestWorkspace(url: string, init: RequestInit, fallback: string): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      message: response.ok
        ? (result.message ?? fallback)
        : (result.error ?? "No se pudo completar la operación.")
    };
  } catch {
    return { ok: false, message: "No se pudo conectar con el servidor." };
  }
}
