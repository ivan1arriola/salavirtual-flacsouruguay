import { z } from "zod";
import type { RolUsuario } from "@/src/modules/usuarios/roles";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value || null));

export const programaAdminSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(180),
  codigo: optionalText(60),
  unidadAcademicaId: optionalText(100),
  activo: z.boolean()
});

export type ActorProgramasAdmin = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

export function puedeAdministrarProgramas(actor: ActorProgramasAdmin): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}
