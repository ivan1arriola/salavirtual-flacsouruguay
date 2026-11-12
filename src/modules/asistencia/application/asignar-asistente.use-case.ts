import { ForbiddenApiError } from "@/src/lib/http/api-error";
import { asignacionAsistenciaSchema, puedeAsignarAsistencia } from "../domain";
import type { AsistenciaRepositoryPort } from "../ports";
import type { SessionActor } from "./actualizar-postulacion.use-case";

export type AsignarAsistenteDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
}>;

export async function asignarAsistenteUseCase(
  deps: AsignarAsistenteDeps,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new ForbiddenApiError("Solo Administración puede asignar asistentes de monitoreo.");
  }
  const input = asignacionAsistenciaSchema.parse(rawInput);

  return deps.repo.reservarYAsignarAsistente(input.instanciaSalaId, input.asistenteTecnicoId, actor.id);
}
