import { z } from "zod";

export const completarRegistroInstitucionalSchema = z
  .object({
    programaId: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || null),
    programaNuevo: z
      .string()
      .trim()
      .max(180)
      .optional()
      .transform((value) => value || null)
  })
  .refine(({ programaId, programaNuevo }) => Boolean(programaId) !== Boolean(programaNuevo), {
    message: "Elegí un programa existente o escribí el nombre de uno nuevo."
  });

export function requiereCompletarRegistro(
  input: Readonly<{
    rol: "ADMINISTRACION" | "ASISTENTE_TECNICO" | "DOCENTE";
    programasActivos: number;
  }>
): boolean {
  return input.rol === "DOCENTE" && input.programasActivos === 0;
}
