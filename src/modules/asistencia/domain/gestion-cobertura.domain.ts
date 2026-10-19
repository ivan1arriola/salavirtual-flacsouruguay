import { z } from "zod";

const meetingId = z.string().trim().min(1);
const assistantId = z.string().trim().min(1);

export const gestionarCoberturaSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("CONVOCAR"), instanciaSalaId: meetingId }),
  z.object({ accion: z.literal("ASIGNAR_DIRECTO"), instanciaSalaId: meetingId, asistenteTecnicoId: assistantId }),
  z.object({
    accion: z.literal("REGISTRAR_RETROACTIVO"),
    instanciaSalaId: meetingId,
    asistenteTecnicoId: assistantId,
    inicioRealAt: z.coerce.date(),
    finRealAt: z.coerce.date(),
    motivo: z.string().trim().min(10, "Describí el motivo del registro histórico.").max(1000)
  }),
  z.object({ accion: z.literal("APROBAR_RETROACTIVO"), registroId: z.string().trim().min(1) }),
  z.object({ accion: z.literal("RECHAZAR_RETROACTIVO"), registroId: z.string().trim().min(1), motivo: z.string().trim().min(5).max(1000) })
]);
export type GestionarCoberturaCommand = z.infer<typeof gestionarCoberturaSchema>;

export function validarIntervaloRetroactivo(
  inicio: Date,
  fin: Date,
  encuentro: Readonly<{ inicio: Date; fin: Date }>,
  ahora: Date
): number {
  const minutos = Math.round((fin.getTime() - inicio.getTime()) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1 || minutos > 24 * 60) {
    throw new Error("El monitoreo debe durar entre 1 minuto y 24 horas.");
  }
  if (fin > ahora) throw new Error("No se puede registrar un monitoreo que todavía no terminó.");
  const margen = 12 * 60 * 60 * 1000;
  if (inicio.getTime() < encuentro.inicio.getTime() - margen ||
      fin.getTime() > encuentro.fin.getTime() + margen) {
    throw new Error("Las horas declaradas están demasiado alejadas del encuentro original.");
  }
  return minutos;
}
