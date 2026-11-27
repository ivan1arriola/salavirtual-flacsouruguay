import { z } from "zod";
import type { RolUsuario } from "./roles";

export const programasDocenteSchema = z.object({
  programaIds: z.array(z.string().trim().min(1)).transform((ids) => [...new Set(ids)]),
});

export type ActorProgramasDocente = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

export function puedeGestionarProgramasPropios(actor: ActorProgramasDocente): boolean {
  return actor.activo && (actor.rol === "DOCENTE" || actor.rol === "ADMINISTRACION");
}

export function puedeGestionarProgramasDocente(
  actor: ActorProgramasDocente,
  docenteUsuarioId: string,
): boolean {
  return (
    actor.activo &&
    (actor.rol === "ADMINISTRACION" || (actor.rol === "DOCENTE" && actor.id === docenteUsuarioId))
  );
}
