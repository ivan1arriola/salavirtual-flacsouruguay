import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Hourglass
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes } from "@/src/lib/ui/assistant-format";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { obtenerDashboardAsistente } from "@/src/modules/asistencia/dashboard-asistente.adapter";
import { formatTiempoRestante } from "@/src/modules/asistencia/dashboard-asistente.domain";

export async function AssistantDashboard({ user }: Readonly<{ user: Session["user"] }>) {
  const actor = await resolveSessionActor(db, { id: user.id, email: user.email });
  if (!actor?.activo || actor.rol !== "ASISTENTE_TECNICO") redirect("/");
  const ahora = new Date();
  const dashboard = await obtenerDashboardAsistente(db, actor.id, ahora);
  if (!dashboard) redirect("/mi-perfil");
  const next = dashboard.nextMeeting;
  const followingMeetings = dashboard.proximasCoberturas.slice(1, 6);
  const currentMinutes = dashboard.mesActual.minutosVirtuales + dashboard.mesActual.minutosHibridos;
  const previousMinutes = dashboard.mesAnterior.minutosVirtuales + dashboard.mesAnterior.minutosHibridos;

  const metrics = [
    { label: "Reuniones disponibles", value: dashboard.reunionesDisponibles, copy: "Eventos abiertos para postularte.", icon: CalendarCheck2, tone: "green" },
    { label: "Mis postulaciones", value: dashboard.postulaciones, copy: "Instancias abiertas donde marcaste interés.", icon: Hourglass, tone: "amber" },
    { label: "Próximas reuniones", value: dashboard.proximasReuniones, copy: "Asignadas a tu perfil.", icon: CalendarClock, tone: "blue" },
    { label: "Horas del mes", value: formatMinutes(currentMinutes), copy: `Virtual ${formatMinutes(dashboard.mesActual.minutosVirtuales)} · Híbrida ${formatMinutes(dashboard.mesActual.minutosHibridos)}`, icon: Clock3, tone: "green" },
    { label: "Mes pasado", value: formatMinutes(previousMinutes), copy: `Virtual ${formatMinutes(dashboard.mesAnterior.minutosVirtuales)} · Híbrida ${formatMinutes(dashboard.mesAnterior.minutosHibridos)}`, icon: CalendarDays, tone: "blue" }
  ] as const;

  return (
    <div className="assistant-dashboard" data-tour="assistant-dashboard">
      {next ? (
        <section className="next-opening" aria-label="Próxima reunión">
          <div>
            <p className="page-eyebrow">
              {formatTiempoRestante(next.inicioAt.getTime(), ahora.getTime())} · {formatDate(next.inicioAt)}
            </p>
            <h1>{next.titulo}</h1>
            <p>
              <strong>{formatTime(next.inicioAt)}–{formatTime(next.finAt)}</strong> · {next.programa} · {next.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"} · {next.sala}
            </p>
          </div>
          <div className="next-opening-actions">
            {next.joinUrl ? (
              <MeetLinkActions
                className="hero-meet-actions"
                openClassName="primary-action"
                url={next.joinUrl}
              />
            ) : (
              <span className="status status-warning">Meet pendiente</span>
            )}
            <Link className="secondary-action" href="/mi-agenda">Ver agenda</Link>
          </div>
        </section>
      ) : (
        <section className="next-opening">
          <div>
            <p className="page-eyebrow">Próxima cobertura</p>
            <h1>Sin reuniones próximas asignadas</h1>
            <p>Tu agenda no tiene coberturas asignadas en este momento.</p>
          </div>
          <div className="next-opening-actions">
            <Link className="primary-action" href="/agenda-abierta">Ver agenda abierta</Link>
          </div>
        </section>
      )}

      <section className="assistant-dashboard-metrics" aria-label="Resumen personal">
        {metrics.map(({ label, value, copy, icon: Icon, tone }) => (
          <article className={`dashboard-metric tone-${tone}`} key={label}>
            <Icon size={20} aria-hidden="true" />
            <div><h2>{label}</h2><p>{copy}</p><strong>{value}</strong></div>
          </article>
        ))}
      </section>

      <section className="response-grid" aria-label="Estado de respuestas">
        <Link href="/agenda-abierta"><Hourglass size={20} /><span><small>Pendientes de respuesta</small><strong>{dashboard.pendientesRespuesta}</strong></span><ArrowRight size={18} /></Link>
        <Link href="/agenda-abierta"><CheckCircle2 size={20} /><span><small>Respondidas</small><strong>{dashboard.respondidas}</strong></span><ArrowRight size={18} /></Link>
      </section>

      <section className="content-section dashboard-table-section assistant-coverages-card">
        <div className="section-heading">
          <div>
            <h2>Siguientes coberturas</h2>
            <p>Tus próximas reuniones asignadas a continuación.</p>
          </div>
          <Link className="text-link" href="/mi-agenda">Ver agenda completa en Mi agenda <ArrowRight size={16} /></Link>
        </div>
        {followingMeetings.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table role-meetings-table assistant-coverages-table">
              <thead><tr><th>Fecha</th><th>Hora</th><th>Reunión</th><th>Programa</th><th>Sala</th><th>Estado</th><th>Acceso</th></tr></thead>
              <tbody>
                {followingMeetings.map((meeting) => (
                  <tr key={meeting.id}>
                    <td>{formatDate(meeting.inicioAt)}</td>
                    <td className="time-cell">{formatTime(meeting.inicioAt)}</td>
                    <td><strong>{meeting.titulo}</strong><small>{meeting.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</small></td>
                    <td>{meeting.programa}</td>
                    <td>{meeting.sala}</td>
                    <td><span className="status status-ok">Asignada</span></td>
                    <td>{meeting.joinUrl ? <MeetLinkActions url={meeting.joinUrl} /> : <span className="muted-text">Pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <CalendarClock size={24} />
            <p>{next ? "No tenés más coberturas asignadas por ahora." : "No tenés coberturas próximas asignadas."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
