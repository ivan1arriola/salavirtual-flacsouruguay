import { CalendarRange } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetingDetailManager } from "@/src/components/meeting-detail-manager";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { puedeGestionarEncuentros } from "@/src/modules/reuniones/encuentros.domain";

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
  if (!request || !puedeGestionarEncuentros(
    actor.rol,
    actor.id,
    request.docentePrograma.docente.usuarioId
  )) notFound();

  const now = new Date();
  const seriesRequests = await db.solicitudSala.findMany({
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
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            include: { asistente: { include: { usuario: true } } }
          },
          intereses: { where: { estado: "ME_INTERESA" }, select: { id: true } }
        }
      }
    }
  });
  const meetings = seriesRequests
    .flatMap((seriesRequest) => seriesRequest.instancias.map((meeting) => ({
      ...meeting,
      solicitudId: seriesRequest.id,
      encuentrosEnSolicitud: seriesRequest.instancias.length
    })))
    .sort((left, right) => left.inicioProgramadoAt.getTime() - right.inicioProgramadoAt.getTime());
  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{request.docentePrograma.programa.nombre}</p>
          <h1>{request.titulo}</h1>
          <p>{meetings.length} encuentros · {request.docentePrograma.docente.usuario.nombres} {request.docentePrograma.docente.usuario.apellidos}</p>
        </div>
        <CalendarRange size={28} color="var(--brand)" aria-hidden="true" />
      </header>
      <section className="meeting-overview" aria-label="Datos de la Reunión">
        <div><span>Modalidad</span><strong>{request.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</strong></div>
        <div><span>Estado</span><strong>{request.estado.toLowerCase().replaceAll("_", " ")}</strong></div>
        <div><span>Zona horaria</span><strong>UTC-3 · Montevideo</strong></div>
        <div><span>Encuentros</span><strong>{meetings.length}</strong></div>
        {request.descripcion ? <p>{request.descripcion}</p> : null}
      </section>
      <MeetingDetailManager
        solicitudId={request.id}
        requestIds={seriesRequests.map(({ id }) => id)}
        meetings={meetings.map((meeting, index) => {
          const event = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
          const assignment = meeting.asignaciones[0];
          return {
            id: meeting.id,
            solicitudId: meeting.solicitudId,
            encuentrosEnSolicitud: meeting.encuentrosEnSolicitud,
            ordinal: index + 1,
            inicio: toLocalInput(meeting.inicioProgramadoAt),
            fin: toLocalInput(meeting.finProgramadoAt),
            estado: meeting.estado,
            requiereAsistencia: meeting.requiereAsistencia,
            asistente: assignment ? `${assignment.asistente.usuario.nombres} ${assignment.asistente.usuario.apellidos ?? ""}`.trim() : null,
            postulantes: meeting.intereses.length,
            host: event?.cuentaProveedor?.nombre ?? "Sala pendiente",
            codigoMeet: event?.codigoReunion ?? null,
            joinUrl: event?.joinUrl ?? null,
            editable: meeting.estado === "PROGRAMADA" && meeting.inicioProgramadoAt > now,
            temporalidad: meeting.finProgramadoAt < now
              ? "PASADO" as const
              : meeting.inicioProgramadoAt <= now ? "EN_CURSO" as const : "FUTURO" as const
          };
        })}
      />
    </>
  );
}

function toLocalInput(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
