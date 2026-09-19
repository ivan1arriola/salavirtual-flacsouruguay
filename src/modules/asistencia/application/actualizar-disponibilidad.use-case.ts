import {
  disponibilidadSemanalSchema,
  puedeGestionarPostulacion
} from "../domain";
import type { AsistenciaRepositoryPort } from "../ports";
import type { SessionActor } from "./actualizar-postulacion.use-case";

export type ActualizarDisponibilidadDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
}>;

export async function actualizarDisponibilidadUseCase(
  deps: ActualizarDisponibilidadDeps,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeGestionarPostulacion(actor.rol) || !actor.activo) {
    throw new Error("Solo un asistente técnico puede configurar su disponibilidad.");
  }
  const input = disponibilidadSemanalSchema.parse(rawInput);

  await deps.repo.actualizarDisponibilidad(actor.id, input);

  return { ok: true };
}
