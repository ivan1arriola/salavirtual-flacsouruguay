import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

export type FechaReunion = Readonly<{
  inicioProgramadoAt: Date;
}>;

const instanciaSchema = z
  .object({
    inicio: z.coerce.date(),
    fin: z.coerce.date()
  })
  .refine(({ inicio, fin }) => fin.getTime() > inicio.getTime(), {
    message: "La hora de fin debe ser posterior al inicio."
  });

export const crearReunionesSchema = z
  .object({
    titulo: z.string().trim().min(3),
    descripcion: z.string().trim().optional(),
    docenteProgramaId: z.string().trim().min(1),
    cuentaHostId: z.string().trim().min(1),
    cohostCuentaIds: z.array(z.string().trim().min(1)).default([]),
    asistenteId: z.string().trim().min(1).optional(),
    requiereAsistencia: z.boolean().default(false),
    requiereGrabacion: z.boolean().default(false),
    modalidad: z.enum(["HIBRIDA", "VIRTUAL"]),
    timezone: z.string().trim().min(1),
    codigoMeet: z.string().trim().min(3).optional(),
    instancias: z.array(instanciaSchema).min(1)
  })
  .refine((input) => !input.requiereAsistencia || Boolean(input.asistenteId), {
    message: "Debe seleccionar un asistente cuando se requiere asistencia.",
    path: ["asistenteId"]
  });

export type CrearReunionesInput = Readonly<z.infer<typeof crearReunionesSchema>>;

export function puedeAbrirCreacionReuniones(rol: RolUsuario): boolean {
  return rol === "ADMINISTRACION" || rol === "DOCENTE";
}

export function puedeVerAgendaCompleta(rol: RolUsuario): boolean {
  return rol === "ADMINISTRACION" || rol === "DOCENTE";
}

export function puedeCrearReuniones(
  rol: RolUsuario,
  actorUsuarioId: string,
  docenteUsuarioId: string
): boolean {
  return rol === "ADMINISTRACION" || (rol === "DOCENTE" && actorUsuarioId === docenteUsuarioId);
}

const DIAS = Object.freeze([
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado"
] as const);

export function diasDeReunion(
  reuniones: readonly FechaReunion[],
  timezone: string
): readonly string[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short"
  });
  const dayIndex: Readonly<Record<string, number>> = Object.freeze({
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  });
  const indexes = reuniones
    .map(({ inicioProgramadoAt }) => dayIndex[formatter.format(inicioProgramadoAt)])
    .filter((index): index is number => index !== undefined);

  const uniqueIndexes = new Set(indexes);
  return DIAS.filter((_, index) => uniqueIndexes.has(index));
}
