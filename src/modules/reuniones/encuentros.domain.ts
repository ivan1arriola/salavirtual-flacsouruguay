import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

const periodoSchema = z.object({
  inicio: z.coerce.date(),
  fin: z.coerce.date()
}).refine(({ inicio, fin }) => fin.getTime() > inicio.getTime(), {
  message: "La hora de fin debe ser posterior al inicio."
});

export const agregarEncuentroSchema = periodoSchema;
export const actualizarEncuentroSchema = z.union([
  periodoSchema.extend({ accion: z.literal("EDITAR_FECHA") }),
  z.object({ accion: z.literal("CAMBIAR_ASISTENCIA"), requiereAsistencia: z.boolean() })
]);

export function puedeGestionarEncuentros(
  rol: RolUsuario,
  actorUsuarioId: string,
  docenteUsuarioId: string
): boolean {
  return rol === "ADMINISTRACION" ||
    (rol === "DOCENTE" && actorUsuarioId === docenteUsuarioId);
}

export function elegirCuentaHost(
  preferidaId: string | null,
  cuentas: readonly Readonly<{ id: string; prioridad: number }>[],
  ocupadas: readonly string[]
): string | null {
  const disponibles = cuentas
    .filter(({ id }) => !ocupadas.includes(id))
    .reduce<readonly Readonly<{ id: string; prioridad: number }>[]>((ordered, cuenta) => {
      const position = ordered.findIndex((item) => cuenta.prioridad < item.prioridad);
      return position < 0
        ? [...ordered, cuenta]
        : [...ordered.slice(0, position), cuenta, ...ordered.slice(position)];
    }, []);
  return disponibles.find(({ id }) => id === preferidaId)?.id ?? disponibles[0]?.id ?? null;
}
