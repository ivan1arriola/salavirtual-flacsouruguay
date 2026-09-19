import { reporteDuracionSchema } from "../domain";
import type { AsistenciaRepositoryPort } from "../ports";
import type { SessionActor } from "./actualizar-postulacion.use-case";

export type ReportarDuracionDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
}>;

export async function reportarDuracionUseCase(
  deps: ReportarDuracionDeps,
  actor: SessionActor,
  rawInput: unknown,
  ahora = new Date()
) {
  if (!actor.activo || actor.rol !== "ASISTENTE_TECNICO") {
    throw new Error("Solo un asistente técnico puede informar la duración.");
  }
  const input = reporteDuracionSchema.parse(rawInput);

  await deps.repo.reportarDuracion(
    {
      asignacionId: input.asignacionId,
      usuarioId: actor.id,
      inicioReal: input.inicioReal,
      finReal: input.finReal,
      comentario: input.comentario,
      incidencia: input.incidencia
    },
    ahora
  );

  return { ok: true, asignacionId: input.asignacionId };
}
