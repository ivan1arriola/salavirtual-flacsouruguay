import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";
import { pertenecenAlMismoDia } from "./periodos.domain";
import { ANTICIPACION_VIRTUAL_MINUTOS, MARGEN_ASISTENCIA_MINUTOS } from "./horarios-asistencia.domain";

export type FechaReunion = Readonly<{ inicioProgramadoAt: Date }>;
export type PeriodoReunion = Readonly<{ inicio: Date }>;

const instanciaSchema = z
  .object({
    inicio: z.coerce.date(),
    fin: z.coerce.date(),
    asistenciaInicio: z.coerce.date().optional(),
    asistenciaFin: z.coerce.date().optional(),
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
    hostTipo: z.enum(["DOCENTE", "OTRA_CUENTA", "OTRO_CORREO"]).default("DOCENTE"),
    hostCuentaId: z.string().trim().min(1).optional(),
    hostEmail: z.string().trim().email().toLowerCase().optional(),
    cohostCuentaIds: z.array(z.string().trim().min(1)).max(50).default([]),
    cohostEmailsManual: emailListSchema,
    asistenteTecnicoId: z.string().trim().min(1).optional(),
    requiereAsistenciaTecnica: z.boolean().default(false),
    requiereGrabacion: z.boolean().default(false),
    proveedor: z.enum(["GOOGLE_MEET", "ZOOM"]).default("GOOGLE_MEET"),
    modalidad: z.enum(["HIBRIDA", "VIRTUAL"]),
    timezone: z.string().trim().refine(esTimezoneIanaValida, "Timezone IANA inválida."),
    instancias: z.array(instanciaSchema).min(1).max(100)
  })
  .superRefine(({ instancias, timezone, modalidad, requiereAsistenciaTecnica, hostTipo, hostCuentaId, hostEmail }, context) => {
    if (!requiereAsistenciaTecnica) {
      if (hostTipo === "OTRA_CUENTA" && !hostCuentaId) {
        context.addIssue({
          code: "custom",
          message: "Debe seleccionar una cuenta Google para el anfitrión.",
          path: ["hostCuentaId"]
        });
      }
      if (hostTipo === "OTRO_CORREO" && !hostEmail) {
        context.addIssue({
          code: "custom",
          message: "Debe ingresar un correo válido para el anfitrión.",
          path: ["hostEmail"]
        });
      }
    }
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
      const { asistenciaInicio, asistenciaFin, inicio, fin } = instancia;
      const tieneSoloUnExtremo = Boolean(asistenciaInicio) !== Boolean(asistenciaFin);
      if (tieneSoloUnExtremo) {
        context.addIssue({
          code: "custom",
          message: "La hora de llegada y de salida del asistente deben definirse juntas.",
          path: ["instancias", index, asistenciaInicio ? "asistenciaFin" : "asistenciaInicio"]
        });
      }
      if (asistenciaInicio && asistenciaFin) {
        if (asistenciaFin <= asistenciaInicio) {
          context.addIssue({
            code: "custom",
            message: "La hora de salida del asistente debe ser posterior a la de llegada.",
            path: ["instancias", index, "asistenciaFin"]
          });
        }
        if (asistenciaInicio > inicio || asistenciaFin < fin) {
          context.addIssue({
            code: "custom",
            message: "El horario de monitoreo debe cubrir todo el encuentro.",
            path: ["instancias", index, "asistenciaInicio"]
          });
        }
      }
      // Las reuniones virtuales con asistencia tienen cobertura fija. Los clientes anteriores
      // pueden omitir las horas: el servicio las completa al guardar, sin permitir otras horas.
      if (requiereAsistenciaTecnica && modalidad === "VIRTUAL" && asistenciaInicio && asistenciaFin) {
        if (asistenciaInicio.getTime() !== inicio.getTime() - ANTICIPACION_VIRTUAL_MINUTOS * 60 * 1000) {
          context.addIssue({
            code: "custom",
            message: "La asistencia virtual debe comenzar exactamente 15 minutos antes del encuentro.",
            path: ["instancias", index, "asistenciaInicio"]
          });
        }
        if (asistenciaFin.getTime() !== fin.getTime()) {
          context.addIssue({
            code: "custom",
            message: "La asistencia virtual debe terminar exactamente al finalizar el encuentro.",
            path: ["instancias", index, "asistenciaFin"]
          });
        }
      }
      if (requiereAsistenciaTecnica && modalidad === "HIBRIDA") {
        if (!asistenciaInicio || !asistenciaFin) {
          context.addIssue({
            code: "custom",
            message: "Las reuniones híbridas con monitoreo requieren hora exacta de llegada y salida.",
            path: ["instancias", index, "asistenciaInicio"]
          });
        } else {
          const margenMinimoMs = MARGEN_ASISTENCIA_MINUTOS * 60 * 1000;
          if (inicio.getTime() - asistenciaInicio.getTime() < margenMinimoMs) {
            context.addIssue({
              code: "custom",
              message: "El asistente debe llegar al menos 30 minutos antes del inicio de la reunión híbrida.",
              path: ["instancias", index, "asistenciaInicio"]
            });
          }
          if (asistenciaFin.getTime() - fin.getTime() < margenMinimoMs) {
            context.addIssue({
              code: "custom",
              message: "El asistente debe salir al menos 30 minutos después de finalizar la reunión híbrida.",
              path: ["instancias", index, "asistenciaFin"]
            });
          }
        }
      }

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

export function encuentrosComienzanEnFuturo(
  encuentros: readonly PeriodoReunion[],
  ahora: Date
): boolean {
  return encuentros.every(({ inicio }) => inicio > ahora);
}

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
    throw new Error("No se puede asignar un asistente de monitoreo si la reunión no requiere monitoreo.");
  }
  if (rol !== "ADMINISTRACION" && asistenteTecnicoId) {
    throw new Error("Solo Administración puede asignar un asistente de monitoreo al crear una reunión.");
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
