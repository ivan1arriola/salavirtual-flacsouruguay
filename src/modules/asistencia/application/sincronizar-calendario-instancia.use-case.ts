import {
  idEventoCalendarioAsistenteSegmento,
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
      ejecutar(cuenta, "PUBLICAR", async () => {
        const credentials = { serviceAccountEmail, privateKey, subject: cuenta.email };
        const coverageStart = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
        const coverageEnd = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
        const preparationId = idEventoCalendarioAsistenteSegmento(meeting.id, cuenta.id, "PREPARACION");
        const closingId = idEventoCalendarioAsistenteSegmento(meeting.id, cuenta.id, "CIERRE");
        const common = {
          descripcion: meeting.descripcion ?? meeting.solicitudDescripcion,
          reunionInicio: meeting.inicioProgramadoAt,
          reunionFin: meeting.finProgramadoAt,
          modalidad: meeting.modalidad,
          timezone: meeting.timezone,
          instanciaSalaId: meeting.id,
          programa: meeting.programaNombre,
          docente: meeting.docenteNombreCompleto,
        } as const;

        await provider.publicarEvento(credentials, {
          ...common,
          id: eventId,
          tipo: "REUNION",
          titulo: `Asistencia técnica · ${meeting.solicitudTitulo}`,
          inicio: meeting.inicioProgramadoAt,
          fin: meeting.finProgramadoAt,
          joinUrl: meeting.joinUrl,
        });

        if (meeting.modalidad === "HIBRIDA" && coverageStart < meeting.inicioProgramadoAt) {
          await provider.publicarEvento(credentials, {
            ...common,
            id: preparationId,
            tipo: "PREPARACION",
            titulo: `Preparación técnica presencial · ${meeting.solicitudTitulo}`,
            inicio: coverageStart,
            fin: meeting.inicioProgramadoAt,
            joinUrl: null,
          });
        } else {
          await provider.eliminarEvento(credentials, preparationId);
        }

        if (meeting.modalidad === "HIBRIDA" && coverageEnd > meeting.finProgramadoAt) {
          await provider.publicarEvento(credentials, {
            ...common,
            id: closingId,
            tipo: "CIERRE",
            titulo: `Cierre técnico presencial · ${meeting.solicitudTitulo}`,
            inicio: meeting.finProgramadoAt,
            fin: coverageEnd,
            joinUrl: null,
          });
        } else {
          await provider.eliminarEvento(credentials, closingId);
        }
      })
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

