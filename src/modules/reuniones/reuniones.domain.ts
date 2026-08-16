import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";
import { pertenecenAlMismoDia } from "./periodos.domain";

export type FechaReunion = Readonly<{ inicioProgramadoAt: Date }>;

const instanciaSchema = z
  .object({
    inicio: z.coerce.date(),
    fin: z.coerce.date(),
    descripcion: z.string().trim().max(4000).optional()
  })
  .refine(({ inicio, fin }) => fin.getTime() > inicio.getTime(), {
    message: "La hora de fin debe ser posterior al inicio."
  });

const emailListSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value.split(/[\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    }
    return value;
  },
  z.array(z.email().transform((email) => email.toLowerCase())).max(50).default([])
);

export const crearReunionesSchema = z
  .object({
    titulo: z.string().trim().min(3).max(300),
    descripcion: z.string().trim().max(4000).optional(),
    docenteProgramaId: z.string().trim().min(1),
    cohostCuentaIds: z.array(z.string().trim().min(1)).max(50).default([]),
    cohostEmailsManual: emailListSchema,
    asistenteTecnicoId: z.string().trim().min(1).optional(),
    requiereAsistenciaTecnica: z.boolean().default(false),
    requiereGrabacion: z.boolean().default(false),
    modalidad: z.enum(["HIBRIDA", "VIRTUAL"]),
    timezone: z.string().trim().refine(esTimezoneIanaValida, "Timezone IANA inválida."),
    instancias: z.array(instanciaSchema).min(1).max(100)
  })
  .superRefine(({ instancias, timezone }, context) => {
    if (esTimezoneIanaValida(timezone)) {
      instancias.forEach(({ inicio, fin }, index) => {
        if (!pertenecenAlMismoDia(inicio, fin, timezone)) {
          context.addIssue({
            code: "custom",
            message: "El inicio y el fin deben ser del mismo dia.",
            path: ["instancias", index, "fin"]
          });
        }
      });
    }
    instancias.forEach((instancia, index) => {
      const previousOverlap = instancias.slice(0, index).some((previous) =>
        instancia.inicio < previous.fin && instancia.fin > previous.inicio
      );
      if (previousOverlap) {
        context.addIssue({
          code: "custom",
          message: "Los encuentros de una misma serie no pueden superponerse.",
          path: ["instancias", index, "inicio"]
        });
      }
    });
  });

export type CrearReunionesInput = Readonly<z.infer<typeof crearReunionesSchema>>;

function esTimezoneIanaValida(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export const claveIdempotenciaCreacionSchema = z.uuid();

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
  requiereAsistenciaTecnica: boolean,
  asistenteTecnicoId?: string
): string | null {
  if (!requiereAsistenciaTecnica && asistenteTecnicoId) {
    throw new Error("No se puede asignar un asistente técnico si la reunión no requiere asistencia técnica.");
  }
  if (rol !== "ADMINISTRACION" && asistenteTecnicoId) {
    throw new Error("Solo Administración puede asignar un asistente técnico al crear una reunión.");
  }
  return rol === "ADMINISTRACION" && requiereAsistenciaTecnica ? asistenteTecnicoId ?? null : null;
}

const DIAS = Object.freeze([
  "domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"
] as const);

export function diasDeReunion(
  reuniones: readonly FechaReunion[],
  timezone: string
): readonly string[] {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayIndex: Readonly<Record<string, number>> = Object.freeze({
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
  });
  const indexes = reuniones
    .map(({ inicioProgramadoAt }) => dayIndex[formatter.format(inicioProgramadoAt)])
    .filter((index): index is number => index !== undefined);
  const uniqueIndexes = new Set(indexes);
  return DIAS.filter((_, index) => uniqueIndexes.has(index));
}
