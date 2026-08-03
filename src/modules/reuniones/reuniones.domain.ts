import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";
import { pertenecenAlMismoDia } from "./periodos.domain";

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

const emailListSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    }
    return value;
  },
  z.array(z.email().transform((email) => email.toLowerCase())).default([])
);

export const crearReunionesSchema = z
  .object({
    titulo: z.string().trim().min(3),
    descripcion: z.string().trim().optional(),
    docenteProgramaId: z.string().trim().min(1),
    cohostCuentaIds: z.array(z.string().trim().min(1)).default([]),
    cohostEmailsManual: emailListSchema,
    asistenteId: z.string().trim().min(1).optional(),
    requiereAsistencia: z.boolean().default(false),
    requiereGrabacion: z.boolean().default(false),
    modalidad: z.enum(["HIBRIDA", "VIRTUAL"]),
    timezone: z.string().trim().min(1),
    codigoMeet: z.string().trim().min(3).optional(),
    instancias: z.array(instanciaSchema).min(1)
  })
  .superRefine(({ instancias, timezone }, context) => {
    instancias.forEach(({ inicio, fin }, index) => {
      if (!pertenecenAlMismoDia(inicio, fin, timezone)) {
        context.addIssue({
          code: "custom",
          message: "El inicio y el fin deben ser del mismo dia.",
          path: ["instancias", index, "fin"]
        });
      }
    });
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

export function resolverAsignacionInicial(
  rol: RolUsuario,
  requiereAsistencia: boolean,
  asistenteId?: string
): string | null {
  if (!requiereAsistencia && asistenteId) {
    throw new Error("No se puede asignar Asistente si la reunión no requiere asistencia.");
  }
  if (rol !== "ADMINISTRACION" && asistenteId) {
    throw new Error("Solo Administración puede asignar Asistente al crear una reunión.");
  }
  return rol === "ADMINISTRACION" && requiereAsistencia ? asistenteId ?? null : null;
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
