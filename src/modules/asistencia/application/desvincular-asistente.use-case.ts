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
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new Error("Solo Administración puede desvincular asistentes técnicos.");
  }
  const input = desvinculacionAsistenciaSchema.parse(rawInput);

  return deps.repo.desvincularAsistente(input.asignacionId, actor.id);
}
