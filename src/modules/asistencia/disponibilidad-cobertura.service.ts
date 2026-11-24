import type { PrismaClient } from "@prisma/client";
import { ConflictApiError } from "@/src/lib/http/api-error";
import { SEPARACION_MINIMA_ASISTENCIAS_MINUTOS } from "./asistencia.domain";
import { assistantWindow, buscarConflictoAsistencia } from "./reserva-asistencia.service";

type Meeting = Parameters<typeof assistantWindow>[0] & Readonly<{ id: string }>;
type Assistant = Readonly<{
  id: string;
  cesadoHastaProximoInicioSesion: boolean;
  usuario: { activo: boolean; rol: string };
}>;

function motivoInhabilitacion(assistant: Assistant): string | null {
  if (!assistant.usuario.activo || assistant.usuario.rol !== "ASISTENTE_TECNICO") {
    return "Usuario inactivo o sin rol de asistencia técnica.";
  }
  if (assistant.cesadoHastaProximoInicioSesion) {
    return "Asistente temporalmente inhabilitado.";
  }
  return null;
}

function formatTime(date: Date): string {
  return date.toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    dateStyle: "short",
    timeStyle: "short"
  });
}

export async function consultarDisponibilidadCobertura(
  db: PrismaClient,
  meeting: Meeting,
  assistants: readonly Assistant[]
): Promise<Map<string, string | null>> {
  const result = new Map(assistants.map((assistant) => [assistant.id, motivoInhabilitacion(assistant)]));
  let window: ReturnType<typeof assistantWindow>;
  try {
    window = assistantWindow(meeting);
  } catch (error) {
    if (!(error instanceof ConflictApiError)) {
      throw error;
    }
    for (const [id, reason] of result) {
      if (!reason) {
        result.set(id, error.message);
      }
    }
    return result;
  }
  const eligibleIds = assistants.filter((assistant) => !result.get(assistant.id)).map(({ id }) => id);
  if (!eligibleIds.length) {
    return result;
  }
  const assignments = await db.asignacionAsistenciaTecnica.findMany({
    where: {
      asistenteTecnicoId: { in: eligibleIds },
      estado: { in: ["ASIGNADO", "ACEPTADO"] },
      instanciaSalaId: { not: meeting.id },
      instancia: { estado: "PROGRAMADA" }
    },
    select: {
      asistenteTecnicoId: true,
      instancia: {
        select: {
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          inicioAsistenciaTecnicaAt: true,
          finAsistenciaTecnicaAt: true,
          solicitud: { select: { titulo: true } }
        }
      }
    }
  });
  const byAssistant = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const group = byAssistant.get(assignment.asistenteTecnicoId) ?? [];
    group.push(assignment);
    byAssistant.set(assignment.asistenteTecnicoId, group);
  }
  for (const id of eligibleIds) {
    const existing = (byAssistant.get(id) ?? []).map(({ instancia }) => ({
      inicio: instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt,
      fin: instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt,
      title: instancia.solicitud.titulo
    }));
    const conflict = buscarConflictoAsistencia([...existing, { ...window, title: null }]);
    if (conflict) {
      const details = conflict
        .filter(({ title }) => title !== null)
        .map(({ title, inicio, fin }) => `${title} (${formatTime(inicio)} – ${formatTime(fin)})`)
        .join("; ");
      result.set(id, `Conflicto de agenda: ${details}. Se requieren ${SEPARACION_MINIMA_ASISTENCIAS_MINUTOS} minutos de separación entre monitoreos.`);
    }
  }
  return result;
}
