import { z } from "zod";

export type ActorConfiguracionAsistencia = Readonly<{
  id: string;
  rol: string;
  activo: boolean;
}>;

const emailSchema = z.string().trim().toLowerCase().email("Hay un correo electrónico no válido.");

export function puedeConfigurarAsistenciaTecnica(actor: ActorConfiguracionAsistencia): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}

export function normalizarCorreosCopiaReporte(value: unknown): string[] {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value.join("\n") : "";
  const candidates = raw
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const parsed = candidates.map((email) => emailSchema.parse(email));
  return [...new Set(parsed)];
}
