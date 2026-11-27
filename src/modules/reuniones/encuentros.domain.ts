import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

const periodoFields = {
  inicio: z.coerce.date(),
  fin: z.coerce.date(),
} as const;

export const agregarEncuentroSchema = z
  .object({
    ...periodoFields,
    descripcion: z.string().trim().max(4000).optional(),
    inicioAsistenciaTecnica: z.coerce.date().optional(),
    finAsistenciaTecnica: z.coerce.date().optional(),
    requiereAsistenciaTecnica: z.boolean().default(false),
    requiereGrabacion: z.boolean().default(false),
  })
  .superRefine(({ inicio, fin, inicioAsistenciaTecnica, finAsistenciaTecnica }, context) => {
    if (fin.getTime() <= inicio.getTime()) {
      context.addIssue({
        code: "custom",
        message: "La hora de fin debe ser posterior al inicio.",
        path: ["fin"],
      });
    }
    if (Boolean(inicioAsistenciaTecnica) !== Boolean(finAsistenciaTecnica)) {
      context.addIssue({
        code: "custom",
        message: "La hora de llegada y salida del asistente deben definirse juntas.",
        path: [inicioAsistenciaTecnica ? "finAsistenciaTecnica" : "inicioAsistenciaTecnica"],
      });
    }
    if (
      inicioAsistenciaTecnica &&
      finAsistenciaTecnica &&
      finAsistenciaTecnica <= inicioAsistenciaTecnica
    ) {
      context.addIssue({
        code: "custom",
        message: "La hora de salida del asistente debe ser posterior a la de llegada.",
        path: ["finAsistenciaTecnica"],
      });
    }
  });

export const actualizarEncuentroSchema = z.union([
  z
    .object({
      ...periodoFields,
      accion: z.enum(["EDITAR_FECHA", "EDITAR_ENCUENTRO"]),
      descripcion: z.string().trim().max(4000).optional(),
    })
    .refine(({ inicio, fin }) => fin.getTime() > inicio.getTime(), {
      message: "La hora de fin debe ser posterior al inicio.",
    }),
  z.object({ accion: z.literal("CAMBIAR_ASISTENCIA"), requiereAsistenciaTecnica: z.boolean() }),
  z.object({
    accion: z.literal("CAMBIAR_MODALIDAD"),
    modalidad: z.enum(["HIBRIDA", "VIRTUAL"]).nullable(),
  }),
  z
    .object({
      accion: z.literal("EDITAR_HORARIO_ASISTENCIA"),
      inicioAsistenciaTecnica: z.coerce.date(),
      finAsistenciaTecnica: z.coerce.date(),
    })
    .refine(
      ({ inicioAsistenciaTecnica, finAsistenciaTecnica }) =>
        finAsistenciaTecnica > inicioAsistenciaTecnica,
      {
        message: "La hora de salida del asistente debe ser posterior a la de llegada.",
      },
    ),
  z.object({ accion: z.literal("RESTABLECER_HORARIO_ASISTENCIA") }),
]);

export function puedeGestionarEncuentros(
  rol: RolUsuario,
  actorUsuarioId: string,
  docenteUsuarioId: string,
): boolean {
  return rol === "ADMINISTRACION" || (rol === "DOCENTE" && actorUsuarioId === docenteUsuarioId);
}

export function puedeCorregirModalidadHistorica(rol: RolUsuario, estado: string): boolean {
  return rol === "ADMINISTRACION" && estado !== "CANCELADA";
}

export function puedeCambiarAsistenciaEncuentro(
  estado: string,
  finProgramadoAt: Date,
  ahora: Date,
): boolean {
  return estado === "PROGRAMADA" && finProgramadoAt > ahora;
}

type EstadoIntegracionReunion = "PENDIENTE" | "SINCRONIZADA" | "ERROR" | "HISTORICA";
type EstadoSolicitudReunion = "REGISTRADA" | "PROVISIONANDO" | "PROVISIONADA" | "REQUIERE_REVISION";

export function resolverEstadoSolicitudPorIntegraciones(
  estados: readonly EstadoIntegracionReunion[],
): EstadoSolicitudReunion {
  if (estados.length === 0) {
    return "REGISTRADA";
  }
  if (estados.includes("ERROR")) {
    return "REQUIERE_REVISION";
  }
  if (estados.includes("PENDIENTE")) {
    return "PROVISIONANDO";
  }
  return "PROVISIONADA";
}

export function elegirCuentaHost(
  preferidaId: string | null,
  cuentas: readonly Readonly<{ id: string; prioridad: number }>[],
  ocupadas: readonly string[],
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
  periodos: readonly Periodo[],
): string | null {
  const disponibles = cuentas
    .filter((cuenta) => {
      const reservasCuenta = reservas.filter(
        (reserva) =>
          reserva.cuentaProveedorId === cuenta.id &&
          periodos.some((periodo) => seSolapan(reserva, periodo)),
      );
      return respetaCapacidadConcurrente(reservasCuenta, periodos, cuenta.limiteConcurrente ?? 1);
    })
    .reduce<typeof cuentas>((ordered, cuenta) => {
      const position = ordered.findIndex(
        (item) =>
          cuenta.prioridad < item.prioridad ||
          (cuenta.prioridad === item.prioridad && cuenta.id.localeCompare(item.id) < 0),
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
  modalidadOverride: ModalidadEncuentro | null | undefined,
): ModalidadEncuentro {
  return modalidadOverride ?? modalidadSerie;
}

export function periodoAsistenciaTecnica(
  encuentro: Readonly<{
    inicioProgramadoAt: Date;
    finProgramadoAt: Date;
    inicioAsistenciaTecnicaAt?: Date | null;
    finAsistenciaTecnicaAt?: Date | null;
  }>,
): Readonly<{ inicio: Date; fin: Date; personalizado: boolean }> {
  const personalizado = Boolean(
    encuentro.inicioAsistenciaTecnicaAt && encuentro.finAsistenciaTecnicaAt,
  );
  return {
    inicio: encuentro.inicioAsistenciaTecnicaAt ?? encuentro.inicioProgramadoAt,
    fin: encuentro.finAsistenciaTecnicaAt ?? encuentro.finProgramadoAt,
    personalizado,
  };
}

/**
 * A repeated cancellation only retries Google events which still have a
 * persisted CANCELAR operation. Completed deletions must not be requeued.
 */
export function idsCancelacionesPendientes(
  instancias: readonly Readonly<{
    eventosProveedor: readonly Readonly<{
      id: string;
      proveedor: Readonly<{ tipo: string }>;
      operacionPendiente: string | null;
    }>[];
  }>[],
): readonly string[] {
  return instancias.flatMap(({ eventosProveedor }) =>
    eventosProveedor
      .filter(({ operacionPendiente }) => operacionPendiente === "CANCELAR")
      .map(({ id }) => id),
  );
}

export function idsCancelacionesGooglePendientes(
  instancias: readonly Readonly<{
    eventosProveedor: readonly Readonly<{
      id: string;
      proveedor: Readonly<{ tipo: string }>;
      operacionPendiente: string | null;
    }>[];
  }>[],
): readonly string[] {
  return instancias.flatMap(({ eventosProveedor }) =>
    eventosProveedor
      .filter(
        ({ proveedor, operacionPendiente }) =>
          (proveedor.tipo === "GOOGLE_MEET" || proveedor.tipo === "ZOOM") &&
          operacionPendiente === "CANCELAR",
      )
      .map(({ id }) => id),
  );
}

/**
 * Checks the actual peak number of simultaneous meetings, not the total number
 * of reservations that overlap a long requested interval. Endpoints are
 * half-open [inicio, fin): a meeting ending at 10:00 frees its slot at 10:00.
 */
function respetaCapacidadConcurrente(
  existentes: readonly Periodo[],
  nuevos: readonly Periodo[],
  limite: number,
): boolean {
  if (!Number.isInteger(limite) || limite < 1) {
    return false;
  }
  const intervalos = [...existentes, ...nuevos];
  if (
    intervalos.some(
      ({ inicio, fin }) =>
        !Number.isFinite(inicio.getTime()) ||
        !Number.isFinite(fin.getTime()) ||
        inicio.getTime() >= fin.getTime(),
    )
  ) {
    return false;
  }

  const cambios = intervalos
    .flatMap(({ inicio, fin }) => [
      { instante: inicio.getTime(), delta: 1 },
      { instante: fin.getTime(), delta: -1 },
    ])
    .reduce<readonly Readonly<{ instante: number; delta: number }>[]>((ordenados, cambio) => {
      const posicion = ordenados.findIndex(
        (existente) =>
          existente.instante > cambio.instante ||
          (existente.instante === cambio.instante && existente.delta > cambio.delta),
      );
      return posicion < 0
        ? [...ordenados, cambio]
        : [...ordenados.slice(0, posicion), cambio, ...ordenados.slice(posicion)];
    }, []);

  const ocupacion = cambios.reduce(
    (estado, cambio) => {
      const activas = estado.activas + cambio.delta;
      return { activas, maximo: Math.max(estado.maximo, activas) };
    },
    { activas: 0, maximo: 0 },
  );
  return ocupacion.maximo <= limite;
}
