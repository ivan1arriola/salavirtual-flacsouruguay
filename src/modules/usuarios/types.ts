import { z } from "zod";

export const usuarioIdSchema = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres.")
  .max(50, "El usuario no puede superar los 50 caracteres.")
  .regex(/^[a-z0-9._-]+$/i, "El usuario contiene caracteres no permitidos.");

export const vincularCuentaGoogleSchema = z.object({
  usuarioId: usuarioIdSchema,
  email: z
    .email()
    .transform((email) => email.trim().toLowerCase())
    .refine((email) => email.endsWith("@flacso.edu.uy"), {
      message: "La cuenta debe pertenecer al dominio flacso.edu.uy.",
    }),
  providerAccountId: z.string().trim().min(1),
  dominio: z.literal("flacso.edu.uy"),
});
