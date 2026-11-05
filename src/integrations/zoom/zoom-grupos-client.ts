import type { MiembroGrupoZoom } from "../../modules/configuracion/zoom-grupo-sincronizacion.domain";

export type GrupoZoom = Readonly<{ id: string; nombre: string; totalMiembros: number }>;

export class ZoomPermisosError extends Error {
  constructor(message = MENSAJE_PERMISOS) {
    super(message);
    this.name = "ZoomPermisosError";
  }
}

const MENSAJE_PERMISOS =
  "Falta permiso en la app de Zoom: group:read:list_groups:admin y group_member:read:list_members:admin.";
const MAX_PAGINAS = 50;

async function pedirZoom<T>(url: string, token: string, accion: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new ZoomPermisosError();
  if (response.status === 404) throw new Error("El grupo de Zoom ya no existe.");
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Zoom API error al ${accion} (${response.status}): ${errorBody || response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function listarGruposZoomHttp(token: string): Promise<readonly GrupoZoom[]> {
  const data = await pedirZoom<{ groups?: readonly { id: string; name: string; total_members?: number }[] }>(
    "https://api.zoom.us/v2/groups",
    token,
    "listar grupos"
  );
  return (data.groups ?? []).map((g) => ({ id: g.id, nombre: g.name, totalMiembros: g.total_members ?? 0 }));
}

export async function listarMiembrosGrupoZoomHttp(
  token: string,
  grupoId: string
): Promise<readonly MiembroGrupoZoom[]> {
  const base = `https://api.zoom.us/v2/groups/${encodeURIComponent(grupoId)}/members?page_size=300`;
  const miembros: MiembroGrupoZoom[] = [];
  let paginaToken = "";
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const url = paginaToken ? `${base}&next_page_token=${encodeURIComponent(paginaToken)}` : base;
    const data = await pedirZoom<{
      members?: readonly { id: string; email: string; first_name?: string; last_name?: string; type?: number }[];
      next_page_token?: string;
    }>(url, token, "listar miembros del grupo");
    for (const m of data.members ?? []) {
      const nombre = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
      miembros.push({ id: m.id, email: m.email, nombre: nombre || m.email, licenciado: m.type === 2 });
    }
    if (!data.next_page_token) return miembros;
    paginaToken = data.next_page_token;
  }
  throw new Error(`El grupo de Zoom supera el máximo de ${MAX_PAGINAS} páginas de miembros.`);
}
