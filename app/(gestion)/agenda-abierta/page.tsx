import { Hand } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantAssignmentSelect } from "@/src/components/assistant-assignment-select";
import { AssistantInterestButton } from "@/src/components/assistant-interest-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export default async function AgendaAbiertaPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !["ASISTENTE_TECNICO", "ADMINISTRACION"].includes(actor.rol)) {
    redirect("/reuniones");
  }
  const assistant = actor.rol === "ASISTENTE_TECNICO"
    ? await db.asistenteTecnico.findUnique({ where: { usuarioId: actor.id }, select: { id: true } })
    : null;
  if (actor.rol === "ASISTENTE_TECNICO" && !assistant) redirect("/");

  const meetings = await db.instanciaSala.findMany({
    where: {
      requiereAsistenciaTecnica: true,
      finProgramadoAt: { gte: new Date() },
      estado: "PROGRAMADA",
      asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } }
    },
    orderBy: { inicioProgramadoAt: "asc" },
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
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } }
    }
  });
  const meetingIds = meetings.map(({ id }) => id);
  const [interests, assistantOptions] = await Promise.all([
    actor.rol === "ASISTENTE_TECNICO"
      ? db.postulacionAsistenciaTecnica.findMany({
          where: { instanciaSalaId: { in: meetingIds }, asistenteTecnicoId: assistant?.id },
          select: { instanciaSalaId: true, estado: true }
        })
      : db.postulacionAsistenciaTecnica.findMany({
          where: {
            instanciaSalaId: { in: meetingIds },
            estado: "ME_INTERESA",
            asistenteTecnico: { cesadoHastaProximoInicioSesion: false }
          },
          select: {
            instanciaSalaId: true,
            asistenteTecnico: { select: { id: true, usuario: { select: { nombres: true, apellidos: true } } } }
          },
          orderBy: { createdAt: "asc" }
        }),
    actor.rol === "ADMINISTRACION"
      ? db.asistenteTecnico.findMany({
          where: {
            cesadoHastaProximoInicioSesion: false,
            usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
          },
          orderBy: [{ usuario: { nombres: "asc" } }, { usuario: { apellidos: "asc" } }],
          select: { id: true, usuario: { select: { nombres: true, apellidos: true } } }
        })
      : Promise.resolve([])
  ]);
  const assignableAssistants = assistantOptions.map((item) => ({
    id: item.id,
    name: [item.usuario.nombres, item.usuario.apellidos].filter(Boolean).join(" ")
  }));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Asistencia técnica</p>
          <h1>Agenda abierta</h1>
          <p>{meetings.length} reuniones sin asistente técnico asignado.</p>
        </div>
        <Hand size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      <section
        className="content-section"
        data-tour={actor.rol === "ASISTENTE_TECNICO" ? "assistant-open-list" : undefined}
      >
        {meetings.length === 0 ? (
          <div className="empty-state"><Hand size={24} aria-hidden="true" /><p>No hay reuniones abiertas para postulación.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha y hora (UTC-3)</th><th>Reunión</th><th>Programa</th><th>Sala</th><th>{actor.rol === "ASISTENTE_TECNICO" ? "Postulación" : "Postulantes"}</th></tr></thead>
              <tbody>
                {meetings.map((meeting) => {
                  const association = meeting.solicitud.docentePrograma;
                  const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                  if (actor.rol === "ASISTENTE_TECNICO") {
                    const interest = interests.find((item) => item.instanciaSalaId === meeting.id);
                    const interested = interest && "estado" in interest && interest.estado === "ME_INTERESA";
                    return (
                      <tr key={meeting.id}>
                        <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                        <td><strong>{meeting.solicitud.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                        <td>{association.programa.nombre}</td>
                        <td>{meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? "Sin cuenta"}</td>
                        <td><AssistantInterestButton meetingId={meeting.id} interested={Boolean(interested)} /></td>
                      </tr>
                    );
                  }
                  const applicants = interests
                    .filter((item) => item.instanciaSalaId === meeting.id && "asistenteTecnico" in item)
                    .map((item) => {
                      if (!("asistenteTecnico" in item)) return null;
                      return {
                        id: item.asistenteTecnico.id,
                        name: [item.asistenteTecnico.usuario.nombres, item.asistenteTecnico.usuario.apellidos].filter(Boolean).join(" ")
                      };
                    })
                    .filter((item): item is { id: string; name: string } => Boolean(item));
                  return (
                    <tr key={meeting.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td><strong>{meeting.solicitud.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                      <td>{association.programa.nombre}</td>
                      <td>{meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? "Sin cuenta"}</td>
                      <td>
                        <AssistantAssignmentSelect
                          assistants={assignableAssistants}
                          applicants={applicants}
                          meetingId={meeting.id}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
