import { ArrowLeft, CalendarClock, Clock3, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { GestionCoberturaPanel } from "@/src/modules/asistencia/presentation/components/gestion-cobertura-panel";

export default async function GestionCoberturaPage({
  params
}: Readonly<{ params: Promise<{ instanciaId: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");

  const { instanciaId } = await params;
  const [meeting, assistants] = await Promise.all([
    db.instanciaSala.findUnique({
      where: { id: instanciaId },
      include: {
        solicitud: { select: { id: true, titulo: true, modalidad: true } },
        asignaciones: {
          where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          include: { asistenteTecnico: { include: { usuario: true } } }
        },
        registrosMonitoreoRetroactivo: {
          orderBy: { createdAt: "desc" },
          include: { asistente: { include: { usuario: true } } }
        }
      }
    }),
    db.asistenteTecnico.findMany({
      orderBy: [{ usuario: { nombres: "asc" } }, { usuario: { apellidos: "asc" } }],
      include: { usuario: { select: { nombres: true, apellidos: true, activo: true } } }
    })
  ]);
  if (!meeting) notFound();
  const past = meeting.finProgramadoAt <= new Date();
  const cancelled = meeting.estado === "CANCELADA" || meeting.estado === "NO_REALIZADA";
  const modality = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
  const current = meeting.asignaciones[0] ?? null;

  return (
    <div className="monitoring-workflow-page">
      <Link className="monitoring-workflow-back" href="/monitoreo">
        <ArrowLeft size={17} aria-hidden="true" /> Volver a monitoreo
      </Link>
      <header className="monitoring-workflow-header">
        <span className="page-eyebrow">Administración · Monitoreo</span>
        <h1>Gestionar monitoreo</h1>
        <p>{meeting.solicitud.titulo}</p>
        <div className="monitoring-workflow-meta">
          <span><CalendarClock size={17} aria-hidden="true" /> {meeting.inicioProgramadoAt.toLocaleDateString("es-UY", { timeZone: "America/Montevideo", dateStyle: "full" })}</span>
          <span><Clock3 size={17} aria-hidden="true" /> {meeting.inicioProgramadoAt.toLocaleTimeString("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" })}–{meeting.finProgramadoAt.toLocaleTimeString("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" })}</span>
          <span><UserRoundCheck size={17} aria-hidden="true" /> {modality === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
        </div>
      </header>
      <GestionCoberturaPanel
        meeting={{
          id: meeting.id,
          past,
          cancelled,
          estado: meeting.estado,
          requiereMonitoreo: meeting.requiereAsistenciaTecnica,
          modalidad: modality,
          inicio: meeting.inicioProgramadoAt.toISOString(),
          fin: meeting.finProgramadoAt.toISOString(),
          inicioMonitoreo: meeting.inicioAsistenciaTecnicaAt?.toISOString() ?? null,
          finMonitoreo: meeting.finAsistenciaTecnicaAt?.toISOString() ?? null,
          asignado: current
            ? [current.asistenteTecnico.usuario.nombres, current.asistenteTecnico.usuario.apellidos].filter(Boolean).join(" ")
            : null
        }}
        assistants={assistants.map((assistant) => ({
          id: assistant.id,
          name: [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" "),
          eligible: assistant.usuario.activo && !assistant.cesadoHastaProximoInicioSesion
        }))}
        historical={meeting.registrosMonitoreoRetroactivo.map((record) => ({
          id: record.id,
          estado: record.estado,
          name: [record.asistente.usuario.nombres, record.asistente.usuario.apellidos].filter(Boolean).join(" "),
          inicio: record.inicioRealAt.toISOString(),
          fin: record.finRealAt.toISOString(),
          minutos: record.minutos,
          monto: record.montoEstimado.toNumber(),
          moneda: record.moneda,
          motivo: record.motivo,
          motivoRechazo: record.motivoRechazo
        }))}
      />
    </div>
  );
}
