import {
  ArrowLeft,
  CalendarClock,
  CalendarRange,
  UsersRound,
  Video
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetingDetailManager } from "@/src/modules/reuniones/presentation/components/meeting-detail-manager";
import { MeetingIntegrationProblems } from "@/src/modules/reuniones/presentation/components/meeting-integration-problems";
import { SeriesManagement } from "@/src/modules/reuniones/presentation/components/series-management";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatLongDate } from "@/src/lib/ui/format";
import {
  cohostsConfirmados,
  estadoIntegracionEfectivo,
  requiereAtencionIntegracionMeet
} from "@/src/modules/conferencias/api";
import {
  puedeCambiarAsistenciaEncuentro,
  resolverEstadoSolicitudPorIntegraciones
} from "@/src/modules/reuniones/encuentros.domain";
import {
  destinatariosDocentesPrograma,
  puedeGestionarPrograma
} from "@/src/modules/reuniones/permisos-programa.service";

export default async function ReunionDetailPage({
  params
}: Readonly<{ params: Promise<{ solicitudId: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");

  const { solicitudId } = await params;
  const request = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    include: {
      docentePrograma: { include: { programa: true, docente: { include: { usuario: true } } } }
    }
  });
  if (!request || !await puedeGestionarPrograma(db, actor, request.docentePrograma.programaId)) notFound();

  const now = new Date();
  const [seriesRequests, cohostAccounts, programRecipients] = await Promise.all([
    db.solicitudSala.findMany({
      where: {
        docenteProgramaId: request.docenteProgramaId,
        titulo: request.titulo,
        createdAt: request.createdAt
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        modalidad: true,
        inicioAsistenciaTecnicaAt: true,
        finAsistenciaTecnicaAt: true,
        instancias: {
          orderBy: { inicioProgramadoAt: "asc" },
          include: {
            eventosProveedor: {
              include: {
                proveedor: true,
                cuentaProveedor: true,
                archivos: true
              }
            },
            cohosts: {
              include: {
                cuentaGoogle: {
                  include: { user: true }
                }
              }
            },
            cohostEmails: { select: { email: true } },
            asignaciones: {
              where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
              include: { asistenteTecnico: { include: { usuario: true } } }
            },
            postulaciones: { where: { estado: "ME_INTERESA" }, select: { id: true } }
          }
        }
      }
    }),
    db.cuentaGoogleFlacso.findMany({
      where: { user: { activo: true } },
      orderBy: { email: "asc" },
      select: { id: true, email: true, userId: true }
    }),
    destinatariosDocentesPrograma(db, request.docentePrograma.programaId)
  ]);

  const meetings = seriesRequests
    .flatMap((seriesRequest) => seriesRequest.instancias.map((meeting) => ({
      ...meeting,
      solicitudId: seriesRequest.id,
      modalidadSerie: seriesRequest.modalidad,
      inicioAsistenciaBase: seriesRequest.inicioAsistenciaTecnicaAt,
      finAsistenciaBase: seriesRequest.finAsistenciaTecnicaAt,
      encuentrosEnSolicitud: seriesRequest.instancias.length
    })))
    .sort((left, right) => left.inicioProgramadoAt.getTime() - right.inicioProgramadoAt.getTime());

  const manageableMeetings = meetings.filter((meeting) =>
    meeting.estado === "PROGRAMADA" && meeting.finProgramadoAt > now
  );

  const protectedUserIds = new Set([
    request.docentePrograma.docente.usuario.id,
    ...manageableMeetings.flatMap(({ asignaciones }) =>
      asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario.id)
    )
  ]);
  const protectedCohostIds = new Set(
    cohostAccounts
      .filter(({ userId }) => protectedUserIds.has(userId))
      .map(({ id }) => id)
  );
  const initialCohostCuentaIds = unique([
    ...manageableMeetings.flatMap(({ cohosts }) => cohosts.map(({ cuentaGoogleId }) => cuentaGoogleId)),
    ...protectedCohostIds
  ]);
  const initialManualCohostEmails = unique(
    manageableMeetings.flatMap(({ cohostEmails }) => cohostEmails.map(({ email }) => email.toLowerCase()))
  );

  const estadoVisible = request.estado === "CANCELADA"
    ? request.estado
    : resolverEstadoSolicitudPorIntegraciones(
      meetings.flatMap(({ eventosProveedor }) => eventosProveedor.map((event) => estadoIntegracionEfectivo(event)))
    );

  const todayInMontevideo = toLocalInput(now).slice(0, 10);
  const meetingViews = meetings.map((meeting, index) => {
    const event = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
    const assignment = meeting.asignaciones[0];
    const organizerAccount = event?.cuentaProveedor?.emailOrganizador
      ?? event?.cuentaProveedor?.nombre
      ?? "Cuenta pendiente";
    const cohostLabels = unique([
      ...meeting.cohosts.map(({ cuentaGoogle }) => cohostLabel(cuentaGoogle)),
      ...meeting.cohostEmails.map(({ email }) => email.toLowerCase())
    ]);
    const recordingFile = event?.archivos?.find((a) => a.tipo === "GRABACION");
    const attendanceFile = event?.archivos?.find((a) => a.tipo === "LISTA_ASISTENCIA");
    const driveFolderId = event?.driveFolderId ?? null;

    return {
      id: meeting.id,
      solicitudId: meeting.solicitudId,
      encuentrosEnSolicitud: meeting.encuentrosEnSolicitud,
      ordinal: index + 1,
      descripcion: meeting.descripcion,
      inicio: toLocalInput(meeting.inicioProgramadoAt),
      fin: toLocalInput(meeting.finProgramadoAt),
      fechaLegible: formatLongDate(meeting.inicioProgramadoAt),
      estado: meeting.estado,
      modalidad: meeting.modalidadOverride ?? meeting.modalidadSerie,
      modalidadPersonalizada: meeting.modalidadOverride !== null,
      requiereAsistenciaTecnica: meeting.requiereAsistenciaTecnica,
      inicioAsistencia: meeting.inicioAsistenciaTecnicaAt
        ? toLocalInput(meeting.inicioAsistenciaTecnicaAt)
        : null,
      finAsistencia: meeting.finAsistenciaTecnicaAt
        ? toLocalInput(meeting.finAsistenciaTecnicaAt)
        : null,
      horarioAsistenciaPersonalizado: Boolean(
        meeting.inicioAsistenciaTecnicaAt && meeting.finAsistenciaTecnicaAt &&
        meeting.inicioAsistenciaBase && meeting.finAsistenciaBase &&
        (meeting.inicioAsistenciaTecnicaAt.getTime() !== meeting.inicioAsistenciaBase.getTime() ||
          meeting.finAsistenciaTecnicaAt.getTime() !== meeting.finAsistenciaBase.getTime())
      ),
      horarioAsistenciaBaseDisponible: Boolean(
        meeting.inicioAsistenciaBase && meeting.finAsistenciaBase
      ),
      asistenteTecnico: assignment
        ? `${assignment.asistenteTecnico.usuario.nombres} ${assignment.asistenteTecnico.usuario.apellidos ?? ""}`.trim()
        : null,
      postulantes: meeting.postulaciones.length,
      organizerAccount,
      cohosts: cohostLabels,
      cohostsConfirmados: !event?.errorIntegracion && !event?.operacionPendiente && cohostsConfirmados(
        event?.payloadUltimo, event?.codigoReunion, event?.cuentaProveedor?.emailOrganizador,
        [...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email), ...meeting.cohostEmails.map(({ email }) => email)],
      ),
      codigoMeet: event?.codigoReunion ?? null,
      joinUrl: event?.joinUrl ?? null,
      grabacionUrl: recordingFile?.webViewUrl ?? (recordingFile?.driveFileId ? `https://drive.google.com/open?id=${recordingFile.driveFileId}` : null),
      asistenciaUrl: attendanceFile?.webViewUrl ?? (attendanceFile?.driveFileId ? `https://drive.google.com/open?id=${attendanceFile.driveFileId}` : null),
      driveFolderUrl: driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : null,
      editable: meeting.estado === "PROGRAMADA" && meeting.inicioProgramadoAt > now,
      puedeCambiarAsistencia: puedeCambiarAsistenciaEncuentro(
        meeting.estado,
        meeting.finProgramadoAt,
        now
      ),
      esDeHoy: toLocalInput(meeting.inicioProgramadoAt).slice(0, 10) === todayInMontevideo,
      temporalidad: meeting.finProgramadoAt < now
        ? "PASADO" as const
        : meeting.inicioProgramadoAt <= now ? "EN_CURSO" as const : "FUTURO" as const
    };
  });

  const nextMeeting = meetingViews.find((meeting) =>
    meeting.temporalidad !== "PASADO"
    && meeting.estado !== "CANCELADA"
    && meeting.estado !== "NO_REALIZADA"
  );
  const uniqueCohosts = unique(meetingViews.flatMap(({ cohosts }) => cohosts));
  const teacherName = [
    request.docentePrograma.docente.usuario.nombres,
    request.docentePrograma.docente.usuario.apellidos
  ].filter(Boolean).join(" ");
  const assistanceSummary = nextMeeting
    ? nextMeeting.asistenteTecnico
      ? nextMeeting.asistenteTecnico
      : nextMeeting.requiereAsistenciaTecnica
        ? "Pendiente de asignación"
        : "No requiere"
    : "Sin próximos encuentros";

  const integrationProblems = meetings.flatMap((meeting, index) => {
    const event = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
    if (!event || !requiereAtencionIntegracionMeet(event)) return [];
    return [{
      eventoProveedorId: event.id,
      ordinal: index + 1,
      fechaLegible: formatLongDate(meeting.inicioProgramadoAt),
      hasMeet: Boolean(event.joinUrl || event.codigoReunion),
      error: event.errorIntegracion,
    }];
  });

  return (
    <div className="meeting-detail-v2">
      <Link className="meeting-detail-back" href="/reuniones">
        <ArrowLeft size={15} aria-hidden="true" />Volver a agenda
      </Link>

      <section className="meeting-detail-hero">
        <div className="meeting-detail-hero-copy">
          <div className="meeting-detail-hero-topline">
            <p className="page-eyebrow">{request.docentePrograma.programa.nombre}</p>
            <span className={`status ${requestStatusClass(estadoVisible)}`}>
              {requestStatusLabel(estadoVisible)}
            </span>
          </div>
          <h1>{request.titulo}</h1>
          <div className="meeting-detail-identity">
            <span>{teacherName}</span>
            <span aria-hidden="true">·</span>
            <span>{request.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
            <span aria-hidden="true">·</span>
            <span>{meetings.length} {meetings.length === 1 ? "encuentro" : "encuentros"}</span>
          </div>
          {request.descripcion ? <p className="meeting-detail-description">{request.descripcion}</p> : null}
        </div>

        <div className="meeting-detail-hero-action">
          {nextMeeting ? (
            <>
              <small>Próximo encuentro</small>
              <strong>{nextMeeting.fechaLegible}</strong>
              <span>{nextMeeting.inicio.slice(11, 16)}–{nextMeeting.fin.slice(11, 16)}</span>
              {nextMeeting.joinUrl ? (
                <a className="primary-action" href={nextMeeting.joinUrl} target="_blank" rel="noreferrer">
                  <Video size={17} aria-hidden="true" />Entrar a Meet
                </a>
              ) : (
                <span className="meeting-detail-pending-link">El enlace de Meet todavía está pendiente.</span>
              )}
            </>
          ) : (
            <>
              <small>Próximo encuentro</small>
              <strong>No hay encuentros próximos</strong>
              <span>Consultá la pestaña de pasados para ver el historial.</span>
            </>
          )}
        </div>
      </section>

      <section className="meeting-detail-summary" aria-label="Resumen de la serie">
        <article>
          <CalendarClock size={18} aria-hidden="true" />
          <div>
            <span>Próximo</span>
            <strong>{nextMeeting ? `${nextMeeting.inicio.slice(11, 16)}–${nextMeeting.fin.slice(11, 16)}` : "Sin próximos"}</strong>
            <small>{nextMeeting?.fechaLegible ?? "La serie no tiene encuentros pendientes"}</small>
          </div>
        </article>
        <article>
          <UsersRound size={18} aria-hidden="true" />
          <div>
            <span>Cohosts solicitados</span>
            <strong>{uniqueCohosts.length}</strong>
            <small>Ingresan con sus propias cuentas Google</small>
          </div>
        </article>
        <article>
          <UsersRound size={18} aria-hidden="true" />
          <div>
            <span>Asistencia técnica</span>
            <strong>{assistanceSummary}</strong>
            <small>{nextMeeting?.requiereAsistenciaTecnica ? "Para el próximo encuentro" : "Según cada encuentro"}</small>
          </div>
        </article>
        <article>
          <CalendarRange size={18} aria-hidden="true" />
          <div>
            <span>Serie</span>
            <strong>{meetings.length} {meetings.length === 1 ? "encuentro" : "encuentros"}</strong>
            <small>UTC-3 · Montevideo</small>
          </div>
        </article>
      </section>

      <SeriesManagement
        solicitudId={request.id}
        cohostOptions={cohostAccounts.map(({ id, email }) => ({
          id,
          email,
          required: protectedCohostIds.has(id)
        }))}
        initialCohostCuentaIds={initialCohostCuentaIds}
        initialManualCohostEmails={initialManualCohostEmails}
        programPeopleCount={programRecipients.length}
        hasManageableMeetings={manageableMeetings.length > 0}
      />

      <MeetingIntegrationProblems
        problems={integrationProblems}
        canRepair={actor.rol === "ADMINISTRACION"}
      />

      <MeetingDetailManager
        solicitudId={request.id}
        requestIds={seriesRequests.map(({ id }) => id)}
        meetings={meetingViews}
        canManageOperationalOverrides={actor.rol === "ADMINISTRACION"}
      />
    </div>
  );
}

function cohostLabel(account: Readonly<{
  email: string;
  user: Readonly<{ nombres: string; apellidos: string | null }>;
}>): string {
  const name = [account.user.nombres, account.user.apellidos].filter(Boolean).join(" ").trim();
  return name ? `${name} · ${account.email}` : account.email;
}

function requestStatusClass(status: string): string {
  if (status === "CANCELADA") return "status-error";
  if (status === "REQUIERE_REVISION") return "status-warning";
  if (status === "PROVISIONADA") return "status-ok";
  return "status-neutral";
}

function requestStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function toLocalInput(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
