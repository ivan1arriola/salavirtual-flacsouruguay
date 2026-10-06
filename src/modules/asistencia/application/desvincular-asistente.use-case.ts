import {
  desvinculacionAsistenciaSchema,
  puedeAsignarAsistencia
} from "../domain";
import type { AsistenciaRepositoryPort } from "../ports";
import type { SessionActor } from "./actualizar-postulacion.use-case";

export type DesvincularAsistenteDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
}>;

export async function desvincularAsistenteUseCase(
  deps: DesvincularAsistenteDeps,
  actor: SessionActor,
  rawInput: unknown
) {
  const puedeDesvincular =
    puedeAsignarAsistencia(actor.rol) || actor.rol === "ASISTENTE_TECNICO";
  if (!puedeDesvincular || !actor.activo) {
    throw new Error("No tenés permisos para desvincular esta asistencia técnica.");
  }
  const input = desvinculacionAsistenciaSchema.parse(rawInput);

  return deps.repo.desvincularAsistente(input.asignacionId, actor.id);
}
