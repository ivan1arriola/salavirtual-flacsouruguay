import { z } from "zod";
import { ROLES_USUARIO } from "./roles";

export const usuarioIdSchema = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres.")
  .max(50, "El usuario no puede superar los 50 caracteres.")
  .regex(/^[a-z0-9._-]+$/i, "El usuario contiene caracteres no permitidos.");

export const crearUsuarioSchema = z.object({
  id: usuarioIdSchema,
  personaId: z.string().trim().min(1),
  emailPrincipal: z.email().optional(),
  password: z.string().min(10, "La contrasena debe tener al menos 10 caracteres."),
  rol: z.enum(ROLES_USUARIO).default("DOCENTE")
});

export const vincularCuentaGoogleSchema = z.object({
  usuarioId: usuarioIdSchema,
  email: z
    .email()
    .transform((email) => email.trim().toLowerCase())
    .refine((email) => email.endsWith("@flacso.edu.uy"), {
      message: "La cuenta debe pertenecer al dominio flacso.edu.uy."
    }),
  providerAccountId: z.string().trim().min(1),
  dominio: z.literal("flacso.edu.uy")
});

export const fusionarDocentesSchema = z
  .object({
    usuarioOrigenId: usuarioIdSchema,
    usuarioDestinoId: usuarioIdSchema,
    motivo: z.string().trim().max(500).optional()
  })
  .refine((data) => data.usuarioOrigenId !== data.usuarioDestinoId, {
    message: "Los usuarios de origen y destino deben ser distintos.",
    path: ["usuarioDestinoId"]
  });
