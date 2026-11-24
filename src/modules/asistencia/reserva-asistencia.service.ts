import type { Prisma } from "@prisma/client";
import { ConflictApiError } from "@/src/lib/http/api-error";
import {
  cumpleSeparacionMinimaAsistencias,
  SEPARACION_MINIMA_ASISTENCIAS_MINUTOS
} from "./asistencia.domain";
import { bloquearAgendaAsistente } from "./reserva-asistentes.adapter";
import { obtenerTarifaVigente } from "./tarifas.adapter";

const ACTIVAS = ["ASIGNADO", "ACEPTADO"] as const;
type Periodo = Readonly<{ inicio: Date; fin: Date }>;

export function assistantWindow(
  meeting: Readonly<{
    modalidadOverride: "VIRTUAL" | "HIBRIDA" | null;
    solicitud: { modalidad: "VIRTUAL" | "HIBRIDA" };
    inicioProgramadoAt: Date;
    finProgramadoAt: Date;
    inicioAsistenciaTecnicaAt: Date | null;
    finAsistenciaTecnicaAt: Date | null;
  }>
) {
  const modalidad = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
  if (modalidad === "HIBRIDA" && (!meeting.inicioAsistenciaTecnicaAt || !meeting.finAsistenciaTecnicaAt)) {
    throw new ConflictApiError("Definí llegada y salida del monitoreo híbrido antes de asignar o convocar.");
  }
  const inicio =
    meeting.inicioAsistenciaTecnicaAt ?? new Date(meeting.inicioProgramadoAt.getTime() - 15 * 60_000);
  const fin = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
  if (fin <= inicio) {
    throw new ConflictApiError("Los horarios de monitoreo no son válidos.");
  }
  return { modalidad, inicio, fin };
}

export function buscarConflictoAsistencia<T extends Periodo>(periodos: readonly T[]): readonly [T, T] | null {
  for (const [index, periodo] of periodos.entries()) {
    const otro = periodos.slice(0, index).find((item) => !cumpleSeparacionMinimaAsistencias(periodo, item));
    if (otro) {
      return [otro, periodo];
    }
  }
  return null;
}

/** Regla transaccional única para la asignación inicial y posterior. */
export async function reservarAsistenteDisponible(
  tx: Prisma.TransactionClient,
  asistenteTecnicoId: string,
  modalidad: "HIBRIDA" | "VIRTUAL",
  periodos: readonly Periodo[],
  excluirInstanciaId?: string
) {
  await bloquearAgendaAsistente(tx, asistenteTecnicoId);
  const assistant = await tx.asistenteTecnico.findUnique({
    where: { id: asistenteTecnicoId },
    select: {
      id: true,
      usuarioId: true,
      cesadoHastaProximoInicioSesion: true,
      usuario: { select: { activo: true, rol: true, emailPrincipal: true } }
    }
  });
  if (
    !assistant?.usuario.activo ||
    assistant.usuario.rol !== "ASISTENTE_TECNICO" ||
    assistant.cesadoHastaProximoInicioSesion
  ) {
    throw new ConflictApiError("El asistente de monitoreo seleccionado no está disponible.");
  }
  const existing = await tx.asignacionAsistenciaTecnica.findMany({
    where: {
      asistenteTecnicoId,
      estado: { in: [...ACTIVAS] },
      ...(excluirInstanciaId ? { instanciaSalaId: { not: excluirInstanciaId } } : {}),
      instancia: { estado: "PROGRAMADA" }
    },
    select: {
      instancia: {
        select: {
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          inicioAsistenciaTecnicaAt: true,
          finAsistenciaTecnicaAt: true
        }
      }
    }
  });
  const all = [
    ...existing.map(({ instancia }) => ({
      inicio: instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt,
      fin: instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt
    })),
    ...periodos
  ];
  const conflict = buscarConflictoAsistencia(all);
  if (conflict) {
    throw new ConflictApiError(
      `El asistente necesita al menos ${SEPARACION_MINIMA_ASISTENCIAS_MINUTOS} minutos entre reuniones.`
    );
  }
  return { assistant, tarifa: await obtenerTarifaVigente(tx, modalidad) };
}
