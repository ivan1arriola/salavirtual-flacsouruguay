import type { TipoFiltroArtefacto } from "./grabaciones-filtro.domain";
export type ParametrosGrabaciones = Readonly<{ pagina: number; busqueda: string; filtro: TipoFiltroArtefacto }>;
export type ParamsGrabacionesUrl = Readonly<{ pagina?: string | readonly string[]; busqueda?: string | readonly string[]; filtro?: string | readonly string[] }>;
const filtros: readonly TipoFiltroArtefacto[] = ["TODOS", "GRABACIONES", "ASISTENCIAS", "NOTAS_Y_TRANSCRIPCIONES"];
function primero(value: string | readonly string[] | undefined): string | undefined { return typeof value === "string" ? value : value?.[0]; }
export function normalizarParametrosGrabaciones(params: ParamsGrabacionesUrl): ParametrosGrabaciones {
  const page = Number(primero(params.pagina));
  const filtro = primero(params.filtro) as TipoFiltroArtefacto | undefined;
  return { pagina: Number.isSafeInteger(page) && page > 0 ? page : 1, busqueda: (primero(params.busqueda) ?? "").trim().slice(0, 120), filtro: filtros.includes(filtro as TipoFiltroArtefacto) ? filtro! : "TODOS" };
}
export function crearHrefGrabaciones(actual: ParametrosGrabaciones, cambios: Partial<ParametrosGrabaciones>): string {
  const value = { ...actual, ...cambios };
  const query = [
    value.pagina > 1 ? `pagina=${encodeURIComponent(String(value.pagina))}` : "",
    value.busqueda ? `busqueda=${encodeURIComponent(value.busqueda)}` : "",
    value.filtro !== "TODOS" ? `filtro=${encodeURIComponent(value.filtro)}` : ""
  ].filter(Boolean).join("&");
  return `/grabaciones${query ? `?${query}` : ""}`;
}
