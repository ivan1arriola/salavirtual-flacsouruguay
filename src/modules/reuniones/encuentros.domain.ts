import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

const periodoFields = {
  inicio: z.coerce.date(),
  fin: z.coerce.date()
} as const;

export const agregarEncuentroSchema = z.object({
  ...periodoFields,
  descripcion: z.string().trim().max(4000).optional(),
  inicioAsistenciaTecnica: z.coerce.date().optional(),
  finAsistenciaTecnica: z.coerce.date().optional(),
  requiereAsistenciaTecnica: z.boolean().default(false),
  requiereGrabacion: z.boolean().default(false)
}).superRefine(({ inicio, fin, inicioAsistenciaTecnica, finAsistenciaTecnica }, context) => {
  if (fin.getTime() <= inicio.getTime()) {
    context.addIssue({ code: "custom", message: "La hora de fin debe ser posterior al inicio.", path: ["fin"] });
  }
  if (Boolean(inicioAsistenciaTecnica) !== Boolean(finAsistenciaTecnica)) {
    context.addIssue({
      code: "custom",
      message: "La hora de llegada y salida del asistente deben definirse juntas.",
      path: [inicioAsistenciaTecnica ? "finAsistenciaTecnica" : "inicioAsistenciaTecnica"]
    });
  }
  if (inicioAsistenciaTecnica && finAsistenciaTecnica && finAsistenciaTecnica <= inicioAsistenciaTecnica) {
    context.addIssue({
      code: "custom",
      message: "La hora de salida del asistente debe ser posterior a la de llegada.",
      path: ["finAsistenciaTecnica"]
    });
  }
});

export const actualizarEncuentroSchema = z.union([
  z.object({
    ...periodoFields,
    accion: z.enum(["EDITAR_FECHA", "EDITAR_ENCUENTRO"]),
    descripcion: z.string().trim().max(4000).optional()
  })
    .refine(({ inicio, fin }) => fin.getTime() > inicio.getTime(), {
      message: "La hora de fin debe ser posterior al inicio."
    }),
  z.object({ accion: z.literal("CAMBIAR_ASISTENCIA"), requiereAsistenciaTecnica: z.boolean() }),
  z.object({
    accion: z.literal("CAMBIAR_MODALIDAD"),
    modalidad: z.enum(["HIBRIDA", "VIRTUAL"]).nullable()
  }),
  z.object({
    accion: z.literal("EDITAR_HORARIO_ASISTENCIA"),
    inicioAsistenciaTecnica: z.coerce.date(),
    finAsistenciaTecnica: z.coerce.date()
  }).refine(({ inicioAsistenciaTecnica, finAsistenciaTecnica }) =>
    finAsistenciaTecnica > inicioAsistenciaTecnica, {
      message: "La hora de salida del asistente debe ser posterior a la de llegada."
    }),
  z.object({ accion: z.literal("RESTABLECER_HORARIO_ASISTENCIA") })
]);

export function puedeGestionarEncuentros(
  rol: RolUsuario,
  actorUsuarioId: string,
  docenteUsuarioId: string
): boolean {
  return rol === "ADMINISTRACION" ||
    (rol === "DOCENTE" && actorUsuarioId === docenteUsuarioId);
}

export function puedeCorregirModalidadHistorica(
  rol: RolUsuario,
  estado: string,
): boolean {
  return rol === "ADMINISTRACION" && estado !== "CANCELADA";
}

export function puedeCambiarAsistenciaEncuentro(
  estado: string,
  finProgramadoAt: Date,
  ahora: Date
): boolean {
  return estado === "PROGRAMADA" && finProgramadoAt > ahora;
}

type EstadoIntegracionReunion = "PENDIENTE" | "SINCRONIZADA" | "ERROR" | "HISTORICA";
type EstadoSolicitudReunion = "REGISTRADA" | "PROVISIONANDO" | "PROVISIONADA" | "REQUIERE_REVISION";

export function resolverEstadoSolicitudPorIntegraciones(
  estados: readonly EstadoIntegracionReunion[]
): EstadoSolicitudReunion {
  if (estados.length === 0) return "REGISTRADA";
  if (estados.includes("ERROR")) return "REQUIERE_REVISION";
  if (estados.includes("PENDIENTE")) return "PROVISIONANDO";
  return "PROVISIONADA";
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

type Periodo = Readonly<{ inicio: Date; fin: Date }>;

export function elegirCuentaHostParaPeriodos(
  preferidaId: string | null,
  cuentas: readonly Readonly<{
    id: string;
    prioridad: number;
    limiteConcurrente: number | null;
  }>[],
  reservas: readonly Readonly<Periodo & { cuentaProveedorId: string }>[],
  periodos: readonly Periodo[]
): string | null {
  const disponibles = cuentas
    .filter((cuenta) => periodos.every((periodo, index) => {
      const existentes = reservas.filter((reserva) =>
        reserva.cuentaProveedorId === cuenta.id && seSolapan(reserva, periodo)
      ).length;
      const nuevasSimultaneas = periodos
        .slice(0, index)
        .filter((otro) => seSolapan(otro, periodo))
        .length;
      return existentes + nuevasSimultaneas < (cuenta.limiteConcurrente ?? 1);
    }))
    .reduce<typeof cuentas>((ordered, cuenta) => {
      const position = ordered.findIndex((item) =>
        cuenta.prioridad < item.prioridad ||
        (cuenta.prioridad === item.prioridad && cuenta.id.localeCompare(item.id) < 0)
      );
      return position < 0
        ? [...ordered, cuenta]
        : [...ordered.slice(0, position), cuenta, ...ordered.slice(position)];
    }, []);
  return disponibles.find(({ id }) => id === preferidaId)?.id ?? disponibles[0]?.id ?? null;
}

function seSolapan(left: Periodo, right: Periodo): boolean {
  return left.inicio < right.fin && left.fin > right.inicio;
}


export type ModalidadEncuentro = "HIBRIDA" | "VIRTUAL";

export function modalidadEfectivaEncuentro(
  modalidadSerie: ModalidadEncuentro,
  modalidadOverride: ModalidadEncuentro | null | undefined
): ModalidadEncuentro {
  return modalidadOverride ?? modalidadSerie;
}

export function periodoAsistenciaTecnica(
  encuentro: Readonly<{
    inicioProgramadoAt: Date;
    finProgramadoAt: Date;
    inicioAsistenciaTecnicaAt?: Date | null;
    finAsistenciaTecnicaAt?: Date | null;
  }>
): Readonly<{ inicio: Date; fin: Date; personalizado: boolean }> {
  const personalizado = Boolean(
    encuentro.inicioAsistenciaTecnicaAt && encuentro.finAsistenciaTecnicaAt
  );
  return {
    inicio: encuentro.inicioAsistenciaTecnicaAt ?? encuentro.inicioProgramadoAt,
    fin: encuentro.finAsistenciaTecnicaAt ?? encuentro.finProgramadoAt,
    personalizado
  };
}

/**
 * A repeated cancellation only retries Google events which still have a
 * persisted CANCELAR operation. Completed deletions must not be requeued.
 */
export function idsCancelacionesGooglePendientes(
  instancias: readonly Readonly<{
    eventosProveedor: readonly Readonly<{
      id: string;
      proveedor: Readonly<{ tipo: string }>;
      operacionPendiente: string | null;
    }>[];
  }>[]
): readonly string[] {
  return instancias.flatMap(({ eventosProveedor }) =>
    eventosProveedor
      .filter(({ proveedor, operacionPendiente }) =>
        proveedor.tipo === "GOOGLE_MEET" && operacionPendiente === "CANCELAR"
      )
      .map(({ id }) => id)
  );
}
