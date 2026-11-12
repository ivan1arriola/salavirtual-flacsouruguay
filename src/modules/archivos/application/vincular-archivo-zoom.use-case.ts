import type { ResultadoVinculo, ZoomArchivoRepositoryPort } from "../ports";

export type ActorVincularZoom = Readonly<{
  id: string | null;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
}>;

export type ResultadoVincularOcurrenciaZoom =
  | ResultadoVinculo
  | Readonly<{ tipo: "PROHIBIDO" }>
  /** Un archivo de Drive de esta ocurrencia ya está referenciado por un archivo Meet: no se vincula a ciegas. */
  | Readonly<{ tipo: "CONFLICTO_DRIVE" }>;

/** Asocia manualmente una ocurrencia conservada con un encuentro Zoom. Solo administración; sin nueva transferencia. */
export async function vincularOcurrenciaZoom(
  deps: Readonly<{ repo: Pick<ZoomArchivoRepositoryPort, "vincularOcurrencia"> }>,
  actor: ActorVincularZoom,
  ocurrenciaId: string,
  eventoId: string
): Promise<ResultadoVincularOcurrenciaZoom> {
  // Autorizar antes de tocar datos: quien no administra tampoco aprende si la ocurrencia existe.
  if (actor.rol !== "ADMINISTRACION") {
    return { tipo: "PROHIBIDO" };
  }
  try {
    return await deps.repo.vincularOcurrencia(
      ocurrenciaId,
      eventoId,
      actor.id === null ? null : { id: actor.id }
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "P2002") {
      return { tipo: "CONFLICTO_DRIVE" };
    }
    throw error;
  }
}
