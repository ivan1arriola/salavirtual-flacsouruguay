import type { ZoomArchivoRepositoryPort } from "../ports/zoom-archivo-repository.port";
import type { ActorVincularZoom } from "./vincular-archivo-zoom.use-case";

export async function reintentarArchivoZoomUseCase(
  repo: Pick<ZoomArchivoRepositoryPort, "reintentarArchivo">,
  actor: ActorVincularZoom,
  archivoId: string
) {
  if (actor.rol !== "ADMINISTRACION") {
    return { tipo: "PROHIBIDO" } as const;
  }
  return repo.reintentarArchivo(archivoId, actor.id === null ? null : { id: actor.id });
}
