import { z } from "zod";

export const solicitudSalaSchema = z.object({
  docenteId: z.string().min(1),
  programaId: z.string().optional(),
  titulo: z.string().min(3),
  descripcion: z.string().optional(),
  modalidad: z.enum(["HIBRIDA", "VIRTUAL"]),
  tipoInstancias: z.enum(["UNICA", "MULTIPLE"]),
  timezone: z.string().min(1),
  fechaInicioSolicitada: z.coerce.date(),
  fechaFinSolicitada: z.coerce.date(),
  requiereAsistencia: z.boolean().default(false),
  requiereGrabacion: z.boolean().default(false)
});

export type SolicitudSalaInput = z.infer<typeof solicitudSalaSchema>;
