import { z } from "zod";

export type ConfiguracionCorreoSesInput = Readonly<{
  activa: boolean;
  awsRegion: string;
  fromEmail: string;
  replyToEmail: string | null;
}>;

const schema = z.object({
  activa: z.boolean(),
  awsRegion: z.string().trim().optional().default(""),
  fromEmail: z.string().trim().toLowerCase().optional().default(""),
  replyToEmail: z.string().trim().toLowerCase().nullable().optional().default("")
}).transform((value) => ({
  activa: value.activa,
  awsRegion: value.awsRegion,
  fromEmail: value.fromEmail,
  replyToEmail: value.replyToEmail || null
})).superRefine((value, ctx) => {
  if (value.activa && !/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(value.awsRegion)) {
    ctx.addIssue({ code: "custom", path: ["awsRegion"], message: "Ingresá una región de AWS válida." });
  }
  if (value.activa && !z.email().safeParse(value.fromEmail).success) {
    ctx.addIssue({ code: "custom", path: ["fromEmail"], message: "Ingresá un correo remitente válido." });
  }
  if (value.replyToEmail && !z.email().safeParse(value.replyToEmail).success) {
    ctx.addIssue({ code: "custom", path: ["replyToEmail"], message: "Ingresá un correo de respuesta válido." });
  }
});

export function normalizarConfiguracionCorreoSes(value: unknown): ConfiguracionCorreoSesInput {
  return schema.parse(value);
}
