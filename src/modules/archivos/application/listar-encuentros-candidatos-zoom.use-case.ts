import type { ZoomCandidatosLecturaPort } from "../ports/zoom-candidatos-lectura.port";
import type { ActorVincularZoom } from "./vincular-archivo-zoom.use-case";
export async function listarEncuentrosCandidatosZoomUseCase(
  repo: ZoomCandidatosLecturaPort,
  actor: ActorVincularZoom,
  ocurrenciaId: string,
) {
  if (actor.rol !== "ADMINISTRACION") {
    return { tipo: "PROHIBIDO" } as const;
  }
  const candidatos = await repo.listarEncuentrosCandidatosZoom(ocurrenciaId);
  return candidatos === null
    ? ({ tipo: "NO_ENCONTRADO" } as const)
    : ({ tipo: "OK", candidatos } as const);
}
