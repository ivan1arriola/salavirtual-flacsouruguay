import { z } from "zod";
import { ROLES_USUARIO } from "./roles";

export const invitarUsuarioSchema = z.object({
  nombres: z.string().trim().min(1).max(100),
  apellidos: z.string().trim().max(120).optional().transform((value) => value || null),
  email: z.email().transform((email) => email.trim().toLowerCase()).refine(
    (email) => email.endsWith("@flacso.edu.uy"),
    "La invitación debe enviarse a un correo @flacso.edu.uy."
  ),
  rol: z.enum(ROLES_USUARIO),
  programaId: z.string().trim().optional().transform((value) => value || null),
  programaNuevo: z.string().trim().max(180).optional().transform((value) => value || null)
}).superRefine(({ rol, programaId, programaNuevo }, context) => {
  if (rol === "DOCENTE" && Boolean(programaId) === Boolean(programaNuevo)) {
    context.addIssue({
      code: "custom",
      message: "Para un docente elegí un programa existente o creá uno nuevo.",
      path: ["programaId"]
    });
  }
  if (rol !== "DOCENTE" && (programaId || programaNuevo)) {
    context.addIssue({
      code: "custom",
      message: "Los programas solo corresponden al rol Docente.",
      path: ["programaId"]
    });
  }
});

export function puedeInvitarUsuarios(actor: Readonly<{
  rol: "ADMINISTRACION" | "ASISTENTE_TECNICO" | "DOCENTE";
  activo: boolean;
}>): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}
