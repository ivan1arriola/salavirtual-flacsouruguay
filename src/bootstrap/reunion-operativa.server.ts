import "server-only";
import {
  cohostsConfirmados,
  type OperacionPendienteConferencia
} from "@/src/modules/conferencias/api";
import {
  crearGoogleArtifactsProviderAdapter,
  type EstadoGrabacionMeet,
  type ParticipanteActivoMeet
} from "@/src/modules/archivos/api";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { ForbiddenApiError, NotFoundApiError } from "@/src/lib/http/api-error";
import {
  derivarEstadoGrabacionOperativa,
  derivarEstadoReunionOperativa,
  incidenciaOperativaSchema,
  puedeConsultarReunionOperativa,
  type EstadoGrabacionOperativa,
  type EstadoReunionOperativa
} from "@/src/modules/reuniones/reunion-operativa.domain";

export type ReunionOperativaActor = Readonly<{
  id: string;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
}>;

export type ReunionOperativaView = Readonly<{
  id: string;
  solicitudId: string;
  titulo: string;
  programa: string;
  docente: string;
  modalidad: "HIBRIDA" | "VIRTUAL";
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
  estado: EstadoReunionOperativa;
  requiereGrabacion: boolean;
  grabacion: Readonly<{
    estado: EstadoGrabacionOperativa;
    url: string | null;
  }>;
  meet: Readonly<{
    eventoProveedorId: string | null;
    codigo: string | null;
    joinUrl: string | null;
    organizador: string | null;
    estadoIntegracion: string | null;
    operacionPendiente: OperacionPendienteConferencia | null;
    errorIntegracion: string | null;
  }>;
  conferencia: Readonly<{
    disponibilidad: "OK" | "SIN_MEET" | "SIN_CREDENCIALES" | "SIN_CONFERENCIA" | "ERROR";
    inicioRealAt: Date | null;
    finRealAt: Date | null;
    participantesActivos: readonly ParticipanteActivoMeet[];
    error: string | null;
  }>;
  cohosts: Readonly<{
    total: number;
    confirmados: boolean;
  }>;
  asistencia: Readonly<{
    requerida: boolean;
    asistente: string | null;
  }>;
  artefactos: Readonly<{
    grabaciones: number;
    transcripciones: number;
    notas: number;
  }>;
  incidencias: readonly Readonly<{
    id: string;
    tipo: string;
    severidad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
    descripcion: string;
    estado: "ABIERTA" | "EN_ANALISIS" | "RESUELTA" | "CERRADA";
    createdAt: Date;
  }>[];
  actualizadoAt: Date;
}>;

export type ReunionOperativaResult =
  | Readonly<{ estado: "NO_ENCONTRADA" }>
  | Readonly<{ estado: "PROHIBIDA" }>
  | Readonly<{ estado: "OK"; reunion: ReunionOperativaView }>;

export async function obtenerReunionOperativa(
  actor: ReunionOperativaActor,
  instanciaId: string,
  ahora = new Date()
): Promise<ReunionOperativaResult> {
  const meeting = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    include: {
      solicitud: {
        include: {
          docentePrograma: {
            include: {
              programa: true,
              docente: { include: { usuario: true } }
            }
          }
        }
      },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        include: { proveedor: true, cuentaProveedor: true },
        take: 1
      },
      cohosts: {
        include: { cuentaGoogle: true }
      },
      cohostEmails: true,
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        include: {
          asistenteTecnico: {
            include: { usuario: true }
          }
        }
      },
      incidencias: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!meeting) return { estado: "NO_ENCONTRADA" };

  const asignacionActor = meeting.asignaciones.find(
    ({ asistenteTecnico }) => asistenteTecnico.usuarioId === actor.id
  );
  if (!puedeConsultarReunionOperativa({
    rol: actor.rol,
    asistenteAsignado: Boolean(asignacionActor)
  })) {
    return { estado: "PROHIBIDA" };
  }

  const evento = meeting.eventosProveedor[0] ?? null;
  const cohostEmails = [
    ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
    ...meeting.cohostEmails.map(({ email }) => email)
  ];
  const cohostConfirmado = Boolean(
    evento
      && !evento.errorIntegracion
      && !evento.operacionPendiente
      && cohostsConfirmados(
        evento.payloadUltimo,
        evento.codigoReunion,
        evento.cuentaProveedor?.emailOrganizador,
        cohostEmails
      )
  );

  let disponibilidad: ReunionOperativaView["conferencia"]["disponibilidad"] = "SIN_MEET";
  let inicioRealAt: Date | null = null;
  let finRealAt: Date | null = null;
  let participantesActivos: readonly ParticipanteActivoMeet[] = [];
  let errorConferencia: string | null = null;
  let estadoProveedorGrabacion: EstadoGrabacionMeet | null = null;
  let grabacionUrl: string | null = null;
  let grabaciones = 0;
  let transcripciones = 0;
  let notas = 0;

  if (evento?.codigoReunion && evento.cuentaProveedor?.emailOrganizador) {
    const config = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal", activa: true },
      select: {
        serviceAccountEmail: true,
        privateKeyCifrada: true
      }
    });

    if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
      disponibilidad = "SIN_CREDENCIALES";
    } else {
      try {
        const provider = crearGoogleArtifactsProviderAdapter({
          serviceAccountEmail: config.serviceAccountEmail,
          privateKey: descifrarConfiguracion(config.privateKeyCifrada),
          subject: evento.cuentaProveedor.emailOrganizador
        });
        const conferencia = await provider.buscarConferencia(
          evento.codigoReunion,
          meeting.inicioProgramadoAt,
          meeting.finProgramadoAt
        );

        if (!conferencia) {
          disponibilidad = "SIN_CONFERENCIA";
        } else {
          disponibilidad = "OK";
          inicioRealAt = new Date(conferencia.startTime);
          finRealAt = conferencia.endTime ? new Date(conferencia.endTime) : null;

          const [participantes, artefactos] = await Promise.all([
            provider.obtenerParticipantesActivos(
              evento.codigoReunion,
              meeting.inicioProgramadoAt,
              meeting.finProgramadoAt
            ),
            provider.obtenerArtefactos(conferencia.name)
          ]);

          participantesActivos = participantes.participantesActivos;
          estadoProveedorGrabacion = artefactos.estadoGrabacion;
          grabaciones = artefactos.recordings.length;
          transcripciones = artefactos.transcripts.length;
          notas = artefactos.notes.length;

          const recording = artefactos.recordings[0];
          grabacionUrl = recording?.driveFileId
            ? `https://drive.google.com/file/d/${encodeURIComponent(recording.driveFileId)}/view`
            : null;
        }
      } catch (error) {
        disponibilidad = "ERROR";
        errorConferencia = error instanceof Error
          ? error.message
          : "No se pudo consultar el estado de Google Meet.";
      }
    }
  }

  const estado = derivarEstadoReunionOperativa({
    ahora,
    inicio: meeting.inicioProgramadoAt,
    fin: meeting.finProgramadoAt,
    conferenciaInicio: inicioRealAt,
    conferenciaFin: finRealAt
  });
  const estadoGrabacion = derivarEstadoGrabacionOperativa({
    requiereGrabacion: meeting.requiereGrabacion,
    estadoReunion: estado,
    estadoProveedor: estadoProveedorGrabacion
  });

  const association = meeting.solicitud.docentePrograma;
  const teacher = association.docente.usuario;
  const assignment = meeting.asignaciones[0];
  const assistant = assignment?.asistenteTecnico.usuario;

  return {
    estado: "OK",
    reunion: {
      id: meeting.id,
      solicitudId: meeting.solicitud.id,
      titulo: meeting.solicitud.titulo,
      programa: association.programa.nombre,
      docente: [teacher.nombres, teacher.apellidos].filter(Boolean).join(" "),
      modalidad: meeting.solicitud.modalidad,
      inicioProgramadoAt: meeting.inicioProgramadoAt,
      finProgramadoAt: meeting.finProgramadoAt,
      estado,
      requiereGrabacion: meeting.requiereGrabacion,
      grabacion: {
        estado: estadoGrabacion,
        url: grabacionUrl
      },
      meet: {
        eventoProveedorId: evento?.id ?? null,
        codigo: evento?.codigoReunion ?? null,
        joinUrl: evento?.joinUrl ?? null,
        organizador: evento?.cuentaProveedor?.emailOrganizador ?? null,
        estadoIntegracion: evento?.estadoIntegracion ?? null,
        operacionPendiente: evento?.operacionPendiente ?? null,
        errorIntegracion: evento?.errorIntegracion ?? null
      },
      conferencia: {
        disponibilidad,
        inicioRealAt,
        finRealAt,
        participantesActivos,
        error: errorConferencia
      },
      cohosts: {
        total: new Set(cohostEmails.map((email) => email.toLowerCase())).size,
        confirmados: cohostConfirmado
      },
      asistencia: {
        requerida: meeting.requiereAsistenciaTecnica,
        asistente: assistant
          ? [assistant.nombres, assistant.apellidos].filter(Boolean).join(" ")
          : null
      },
      artefactos: {
        grabaciones,
        transcripciones,
        notas
      },
      incidencias: meeting.incidencias,
      actualizadoAt: ahora
    }
  };
}


export async function registrarIncidenciaOperativa(
  actor: ReunionOperativaActor,
  instanciaId: string,
  input: unknown
) {
  const parsed = incidenciaOperativaSchema.parse(input);

  return db.$transaction(async (tx) => {
    const meeting = await tx.instanciaSala.findUnique({
      where: { id: instanciaId },
      select: {
        id: true,
        asignaciones: {
          where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          select: {
            asistenteTecnico: { select: { usuarioId: true } }
          }
        }
      }
    });

    if (!meeting) throw new NotFoundApiError("La reunión no existe.");

    const asistenteAsignado = meeting.asignaciones.some(
      ({ asistenteTecnico }) => asistenteTecnico.usuarioId === actor.id
    );
    if (!puedeConsultarReunionOperativa({
      rol: actor.rol,
      asistenteAsignado
    })) {
      throw new ForbiddenApiError("No tenés permisos para registrar incidencias en esta reunión.");
    }

    const incidencia = await tx.incidencia.create({
      data: {
        instanciaSalaId: instanciaId,
        tipo: parsed.tipo,
        severidad: parsed.severidad,
        descripcion: parsed.descripcion
      },
      select: {
        id: true,
        tipo: true,
        severidad: true,
        descripcion: true,
        estado: true,
        createdAt: true
      }
    });

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "INCIDENCIA_OPERATIVA_REGISTRADA",
        entidadTipo: "Incidencia",
        entidadId: incidencia.id,
        valorNuevo: {
          instanciaSalaId: instanciaId,
          tipo: incidencia.tipo,
          severidad: incidencia.severidad,
          descripcion: incidencia.descripcion
        }
      }
    });

    return incidencia;
  });
}
