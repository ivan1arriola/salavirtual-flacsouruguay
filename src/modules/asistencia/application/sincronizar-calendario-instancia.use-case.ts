import {
  planificarSincronizacionCalendarioAsistente,
  type CuentaCalendarioAsistente,
  type ResultadoSincronizacionCalendarioAsistente,
} from "../domain";
import type {
  AssistantCalendarProvider,
  AssistantCalendarRepositoryPort,
} from "../ports";

export async function sincronizarCalendarioAsistenteInstanciaUseCase(
  repository: AssistantCalendarRepositoryPort,
  provider: AssistantCalendarProvider,
  instanciaSalaId: string,
  now = new Date()
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const meeting = await repository.obtenerInstanciaParaCalendario(instanciaSalaId);
  if (!meeting) return [];

  const plan = planificarSincronizacionCalendarioAsistente({
    instanciaId: meeting.id,
    estado: meeting.estado,
    requiereAsistenciaTecnica: meeting.requiereAsistenciaTecnica,
    vigente: (meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt) > now,
    asignaciones: meeting.asignaciones,
  });

  if (plan.publicar.length === 0 && plan.eliminar.length === 0) return [];

  const creds = await repository.obtenerCredencialesWorkspace();
  if (!creds?.serviceAccountEmail || !creds.privateKey) {
    return [
      ...plan.publicar.map(({ cuenta }) => errorConfiguracion(cuenta, "PUBLICAR")),
      ...plan.eliminar.map(({ cuenta }) => errorConfiguracion(cuenta, "ELIMINAR")),
    ];
  }

  const { serviceAccountEmail, privateKey } = creds;

  return Promise.all([
    ...plan.publicar.map(async ({ cuenta, eventId }) =>
      ejecutar(cuenta, "PUBLICAR", async () =>
        provider.publicarEvento(
          { serviceAccountEmail, privateKey, subject: cuenta.email },
          {
            id: eventId,
            titulo: `${meeting.modalidad === "HIBRIDA" ? "Asistencia técnica presencial" : "Asistencia técnica"} · ${meeting.solicitudTitulo}`,
            descripcion: meeting.descripcion ?? meeting.solicitudDescripcion,
            inicio: meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt,
            fin: meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt,
            reunionInicio: meeting.inicioProgramadoAt,
            reunionFin: meeting.finProgramadoAt,
            modalidad: meeting.modalidad,
            timezone: meeting.timezone,
            instanciaSalaId: meeting.id,
            programa: meeting.programaNombre,
            docente: meeting.docenteNombreCompleto,
            joinUrl: meeting.joinUrl,
          }
        )
      )
    ),
    ...plan.eliminar.map(async ({ cuenta, eventId }) =>
      ejecutar(cuenta, "ELIMINAR", async () =>
        provider.eliminarEvento(
          { serviceAccountEmail, privateKey, subject: cuenta.email },
          eventId
        )
      )
    ),
  ]);
}

async function ejecutar(
  cuenta: CuentaCalendarioAsistente,
  accion: "PUBLICAR" | "ELIMINAR",
  operation: () => Promise<void>
): Promise<ResultadoSincronizacionCalendarioAsistente> {
  try {
    await operation();
    return {
      cuentaGoogleId: cuenta.id,
      email: cuenta.email,
      accion,
      estado: "SINCRONIZADA",
    };
  } catch (error) {
    return {
      cuentaGoogleId: cuenta.id,
      email: cuenta.email,
      accion,
      estado: "ERROR",
      error:
        error instanceof Error
          ? error.message
          : "Google Calendar rechazó la sincronización.",
    };
  }
}

function errorConfiguracion(
  cuenta: CuentaCalendarioAsistente,
  accion: "PUBLICAR" | "ELIMINAR"
): ResultadoSincronizacionCalendarioAsistente {
  return {
    cuentaGoogleId: cuenta.id,
    email: cuenta.email,
    accion,
    estado: "ERROR",
    error:
      "Google Workspace no está configurado para sincronizar calendarios de asistentes.",
  };
}

