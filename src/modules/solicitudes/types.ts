import { z } from "zod";

export const solicitudSalaSchema = z.object({
  docenteProgramaId: z.string().min(1),
  titulo: z.string().min(3),
  descripcion: z.string().optional(),
  modalidad: z.enum(["HIBRIDA", "VIRTUAL"]),
  tipoInstancias: z.enum(["UNICA", "MULTIPLE"]),
  timezone: z.string().min(1),
  fechaInicioSolicitada: z.coerce.date(),
  fechaFinSolicitada: z.coerce.date(),
  requiereAsistenciaTecnica: z.boolean().default(false),
  requiereGrabacion: z.boolean().default(false)
});

export type SolicitudSalaInput = Readonly<z.infer<typeof solicitudSalaSchema>>;
