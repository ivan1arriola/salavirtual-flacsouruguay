import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const perfilPersonalSchema = z.object({
  nombres: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
  apellidos: optionalText(120),
  telefono: optionalText(40),
  imagenUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || URL.canParse(value), "La URL de imagen no es válida.")
    .transform((value) => value || null)
    .optional(),
});

export const cambioPasswordSchema = z
  .object({
    passwordActual: z.string().max(200).optional().default(""),
    passwordNueva: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72),
    confirmarPassword: z.string().max(72),
  })
  .refine(({ passwordNueva, confirmarPassword }) => passwordNueva === confirmarPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmarPassword"],
  });
