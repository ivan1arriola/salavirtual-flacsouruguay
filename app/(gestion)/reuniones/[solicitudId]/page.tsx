import { ArrowLeft, CalendarRange } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetingDetailManager } from "@/src/components/meeting-detail-manager";
import { MeetingIntegrationProblems } from "@/src/components/meeting-integration-problems";
import { MeetingRoomCredentials } from "@/src/components/meeting-room-credentials";
import { SeriesManagement } from "@/src/components/series-management";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { formatLongDate } from "@/src/lib/ui/format";
import {
  estadoIntegracionEfectivo,
  requiereAtencionIntegracionMeet
} from "@/src/modules/meet/integration-health.domain";
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
        instancias: {
          orderBy: { inicioProgramadoAt: "asc" },
          include: {
            eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
            cohosts: { select: { cuentaGoogleId: true } },
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
    const cuentaGoogle = event?.cuentaProveedor?.emailOrganizador ?? event?.cuentaProveedor?.nombre ?? "Cuenta pendiente";

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
      requiereAsistenciaTecnica: meeting.requiereAsistenciaTecnica,
      asistenteTecnico: assignment ? `${assignment.asistenteTecnico.usuario.nombres} ${assignment.asistenteTecnico.usuario.apellidos ?? ""}`.trim() : null,
      postulantes: meeting.postulaciones.length,
      cuentaGoogle,
      contrasenaSala: passwordCuenta(event?.cuentaProveedor?.secretRef),
      codigoMeet: event?.codigoReunion ?? null,
      joinUrl: event?.joinUrl ?? null,
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
  const roomCredentials = meetingViews.flatMap((meeting) => meeting.contrasenaSala
    ? [{ cuenta: meeting.cuentaGoogle, contrasena: meeting.contrasenaSala, ordinal: meeting.ordinal }]
    : []
  );
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
    <>
      <Link className="meeting-detail-back" href="/reuniones">
        <ArrowLeft size={15} aria-hidden="true" />Volver a agenda
      </Link>
      <header className="page-header meeting-detail-header">
        <div>
          <p className="page-eyebrow">{request.docentePrograma.programa.nombre}</p>
          <h1>{request.titulo}</h1>
          <p>{meetings.length} encuentros · {request.docentePrograma.docente.usuario.nombres} {request.docentePrograma.docente.usuario.apellidos}</p>
        </div>
        <CalendarRange size={28} color="var(--brand)" aria-hidden="true" />
      </header>
      <section className="meeting-overview" aria-label="Datos de la reunión">
        <div><span>Modalidad</span><strong>{request.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</strong></div>
        <div><span>Estado</span><strong>{estadoVisible.toLowerCase().replaceAll("_", " ")}</strong></div>
        <div><span>Zona horaria</span><strong>UTC-3 · Montevideo</strong></div>
        <div><span>Encuentros</span><strong>{meetings.length}</strong></div>
        {request.descripcion ? <p>{request.descripcion}</p> : null}
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
      <MeetingRoomCredentials credentials={roomCredentials} />
      {actor.rol === "ADMINISTRACION" ? <MeetingRoomCredentials credentials={roomCredentials} /> : null}
      <MeetingIntegrationProblems
        problems={integrationProblems}
        canRepair={actor.rol === "ADMINISTRACION"}
      />
      <MeetingDetailManager
        solicitudId={request.id}
        requestIds={seriesRequests.map(({ id }) => id)}
        meetings={meetingViews.map(({ contrasenaSala: _, ...meeting }) => meeting)}
      />
    </>
  );
}

function passwordCuenta(secretRef: string | null | undefined): string | null {
  if (!secretRef) return null;
  try {
    return descifrarConfiguracion(secretRef);
  } catch {
    return null;
  }
}

function toLocalInput(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
