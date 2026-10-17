import { ForbiddenApiError } from "@/src/lib/http/api-error";
import {
  estadoInteresParaAccion,
  postulacionAsistenciaSchema,
  puedeGestionarPostulacion
} from "../domain";
import type { AsistenciaRepositoryPort } from "../ports";

export type SessionActor = Readonly<{
  id: string;
  email?: string | null;
  rol: string;
  activo: boolean;
}>;

export type ActualizarPostulacionDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
}>;

export async function actualizarPostulacionUseCase(
  deps: ActualizarPostulacionDeps,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeGestionarPostulacion(actor.rol) || !actor.activo) {
    throw new ForbiddenApiError("Solo un asistente de monitoreo puede gestionar postulaciones.");
  }
  const input = postulacionAsistenciaSchema.parse(rawInput);

  const assistant = await deps.repo.obtenerPerfilAsistentePorUsuarioId(actor.id);
  if (
    !assistant?.activo ||
    assistant.cesadoHastaProximoInicioSesion
  ) {
    throw new ForbiddenApiError("No existe un perfil de asistente de monitoreo activo para esta sesión.");
  }

  const estado = estadoInteresParaAccion(input.accion);
  await deps.repo.actualizarPostulacion({
    instanciaSalaId: input.instanciaSalaId,
    asistenteTecnicoId: assistant.id,
    estado,
    comentario: input.comentario
  });

  return { ok: true, accion: input.accion, estado };
}
