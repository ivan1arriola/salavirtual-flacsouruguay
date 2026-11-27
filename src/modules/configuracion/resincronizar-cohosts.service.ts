import type { PrismaClient } from "@prisma/client";
import {
  crearPrismaConferenciasRepository,
  normalizeCohostEmails,
  sincronizarEventosPendientesUseCase,
  type ConferenceProvider,
  type GoogleCalendarCredentials,
} from "@/src/modules/conferencias/api";

export type ResyncCohostFailure = Readonly<{
  instanciaSalaId: string;
  titulo: string;
  inicio: string;
  error: string;
}>;

export type ResyncCohostLogEvent = Readonly<{
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}>;

export type ResyncCohostResult = Readonly<{
  reunionesActivas: number;
  candidatas: number;
  cohostsAgregados: number;
  sincronizadas: number;
  omitidas: number;
  fallidas: number;
  cohostsExternosPendientes: 0;
  reunionesConExternos: 0;
  externos: readonly [];
  errores: readonly ResyncCohostFailure[];
  message: string;
}>;

export type ResyncCohostDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearProvider: (credentials: GoogleCalendarCredentials) => ConferenceProvider;
  onLog?: (event: ResyncCohostLogEvent) => void;
}>;

/**
 * Reaplica los cohosts automáticos de todas las reuniones activas/futuras y
 * ejecuta la misma reconciliación de Google Meet que usa el aprovisionamiento
 * normal. El adapter de Google es responsable del fallback Principal -> Legacy
 * para espacios históricos cuando la API de Members devuelve PERMISSION_DENIED.
 */
export async function resincronizarCohostsReunionesExistentes(
  dependencies: ResyncCohostDependencies,
): Promise<ResyncCohostResult> {
  const { db } = dependencies;
  const emit = (level: ResyncCohostLogEvent["level"], message: string) =>
    dependencies.onLog?.({ level, message });

  const meetings = await db.instanciaSala.findMany({
    where: {
      estado: { in: ["PROGRAMADA", "EN_CURSO"] },
      finProgramadoAt: { gt: new Date() },
    },
    orderBy: { inicioProgramadoAt: "asc" },
    select: {
      id: true,
      inicioProgramadoAt: true,
      solicitud: {
        select: {
          titulo: true,
          docentePrograma: {
            select: {
              docente: {
                select: {
                  usuario: {
                    select: {
                      emailPrincipal: true,
                      cuentasGoogle: { select: { id: true, email: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: {
          asistenteTecnico: {
            select: {
              usuario: {
                select: {
                  emailPrincipal: true,
                  cuentasGoogle: { select: { id: true, email: true } },
                },
              },
            },
          },
        },
      },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: {
          id: true,
          externalEventId: true,
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
        },
        take: 1,
      },
    },
  });

  emit("INFO", `Inicio de resincronización: ${meetings.length} reuniones activas/futuras.`);

  let cohostsAgregados = 0;
  let sincronizadas = 0;
  let candidatas = 0;
  let omitidas = 0;
  const errores: ResyncCohostFailure[] = [];

  for (const meeting of meetings) {
    const event = meeting.eventosProveedor[0];
    const organizer = event?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
    const meetingLabel = `${meeting.solicitud.titulo} | instancia=${meeting.id} | meet=${event?.codigoReunion ?? "sin-codigo"}`;

    if (!event || !organizer) {
      omitidas += 1;
      emit("WARN", `OMITIDA ${meetingLabel} | motivo=sin evento Meet u organizador.`);
      continue;
    }

    const operation = event.externalEventId ? "CONFIGURAR_MEET" : "PROVISIONAR";
    const users = [
      meeting.solicitud.docentePrograma.docente.usuario,
      ...meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario),
    ];
    const accountIds = [
      ...new Set(
        users.flatMap((user) =>
          user.cuentasGoogle
            .filter(({ email }) => email.trim().toLowerCase() !== organizer)
            .map(({ id }) => id),
        ),
      ),
    ];
    const fallbackEmails = normalizeCohostEmails(
      users.flatMap((user) =>
        user.cuentasGoogle.length === 0 && user.emailPrincipal ? [user.emailPrincipal] : [],
      ),
    ).filter((email) => email !== organizer);

    emit(
      "INFO",
      `PROCESANDO ${meetingLabel} | host=${organizer} | cuentasGoogle=${accountIds.length} | emailsFallback=${fallbackEmails.length}.`,
    );

    try {
      const added = await db.$transaction(async (tx) => {
        const queued = await tx.eventoProveedor.updateMany({
          where: {
            id: event.id,
            reclamoIntegracionAt: null,
            OR: [{ operacionPendiente: null }, { operacionPendiente: operation }],
          },
          data: {
            operacionPendiente: operation,
            estadoIntegracion: "PENDIENTE",
            errorIntegracion: null,
          },
        });
        if (queued.count !== 1) {
          return null;
        }

        const linked = accountIds.length
          ? await tx.cohostReunion.createMany({
              data: accountIds.map((cuentaGoogleId) => ({
                instanciaSalaId: meeting.id,
                cuentaGoogleId,
              })),
              skipDuplicates: true,
            })
          : { count: 0 };
        const manual = fallbackEmails.length
          ? await tx.cohostEmailReunion.createMany({
              data: fallbackEmails.map((email) => ({ instanciaSalaId: meeting.id, email })),
              skipDuplicates: true,
            })
          : { count: 0 };

        return linked.count + manual.count;
      });

      if (added === null) {
        omitidas += 1;
        emit("WARN", `OMITIDA ${meetingLabel} | motivo=otra operación pendiente o reclamo activo.`);
        continue;
      }

      candidatas += 1;
      cohostsAgregados += added;
      emit(
        "INFO",
        `GOOGLE ${meetingLabel} | iniciando verificación Principal -> Legacy si corresponde.`,
      );

      const repository = crearPrismaConferenciasRepository({
        db,
        descifrarConfiguracion: dependencies.descifrar,
      });
      const [outcome] = await sincronizarEventosPendientesUseCase(
        repository,
        dependencies.crearProvider,
        [event.id],
      );

      if (outcome?.estado !== "SINCRONIZADA") {
        throw new Error(
          outcome?.error ??
            "La configuración de los cohosts sigue pendiente de confirmación en Google.",
        );
      }
      sincronizadas += 1;
      emit("INFO", `OK ${meetingLabel} | cohostsNuevos=${added}.`);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "No se pudo verificar el rol en Google Meet.";
      emit("ERROR", `ERROR ${meetingLabel} | ${detail}`);
      errores.push({
        instanciaSalaId: meeting.id,
        titulo: meeting.solicitud.titulo,
        inicio: meeting.inicioProgramadoAt.toISOString(),
        error: detail,
      });
    }
  }

  const fallidas = errores.length;
  emit(
    fallidas > 0 ? "WARN" : "INFO",
    `Fin de resincronización: sincronizadas=${sincronizadas}, errores=${fallidas}, omitidas=${omitidas}, cohostsAgregados=${cohostsAgregados}.`,
  );

  return {
    reunionesActivas: meetings.length,
    candidatas,
    cohostsAgregados,
    sincronizadas,
    omitidas,
    fallidas,
    cohostsExternosPendientes: 0,
    reunionesConExternos: 0,
    externos: [],
    errores,
    message: `Cohosts verificados en ${sincronizadas} reuniones; ${fallidas} con error y ${omitidas} omitidas o con otra operación pendiente.`,
  };
}
