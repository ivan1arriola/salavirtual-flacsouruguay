import { notificacionAsistenciaSchema, puedeAsignarAsistencia } from "../domain";
import type { AsistenciaRepositoryPort } from "../ports";
import type { SessionActor } from "./actualizar-postulacion.use-case";

export type RenotificarAsistentesDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
  notificarUsuarios: (
    input: Readonly<{
      usuarioIds: readonly string[];
      asunto: string;
      mensaje: string;
    }>,
  ) => Promise<unknown>;
}>;

export async function renotificarAsistentesUseCase(
  deps: RenotificarAsistentesDeps,
  actor: SessionActor,
  rawInput: unknown,
) {
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new Error("Solo Administración puede renotificar asistentes.");
  }
  const input = notificacionAsistenciaSchema.parse(rawInput);

  const { reunion, destinatarios } = await deps.repo.obtenerAsistentesParaNotificacion(
    input.instanciaSalaId,
  );

  if (destinatarios.length > 0) {
    await deps.notificarUsuarios({
      usuarioIds: destinatarios,
      asunto: `Reunión abierta: ${reunion.titulo}`,
      mensaje: `Hay una nueva reunión abierta para postulaciones: ${reunion.titulo}.`,
    });
  }

  return { ok: true, destinatariosCount: destinatarios.length };
}
