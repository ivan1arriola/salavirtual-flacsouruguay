import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Hand,
  Hourglass
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes } from "@/src/lib/ui/assistant-format";
import { formatDate, formatDateTime, formatTime } from "@/src/lib/ui/format";
import { obtenerDashboardAsistente } from "@/src/modules/asistencia/dashboard-asistente.adapter";

export async function AssistantDashboard({ user }: Readonly<{ user: Session["user"] }>) {
  const actor = await resolveSessionActor(db, { id: user.id, email: user.email });
  if (!actor?.activo || actor.rol !== "ASISTENTE") redirect("/");
  const dashboard = await obtenerDashboardAsistente(db, actor.id);
  if (!dashboard) redirect("/mi-perfil");
  const next = dashboard.nextMeeting;
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
    <div className="assistant-dashboard">
      <section className="next-opening">
        <div>
          <p className="page-eyebrow">Próxima cobertura</p>
          <h1>{next?.titulo ?? "Sin reuniones próximas"}</h1>
          <p>{next ? `${formatDateTime(next.inicioAt)} · ${next.programa}` : "Tu agenda no tiene asignaciones futuras."}</p>
        </div>
        <div className="next-opening-actions">
          <Link className="primary-action" href="/mi-agenda">Mi agenda</Link>
          <Link className="secondary-action" href="/agenda-abierta">Agenda abierta</Link>
        </div>
      </section>

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
          <div><h2>Próximas coberturas</h2><p>Tus reuniones asignadas, ordenadas por fecha.</p></div>
          <Link className="text-link" href="/mi-agenda">Ver agenda completa <ArrowRight size={16} /></Link>
        </div>
        {dashboard.proximasCoberturas.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table role-meetings-table assistant-coverages-table">
              <thead><tr><th>Fecha</th><th>Hora</th><th>Reunión</th><th>Programa</th><th>Sala</th><th>Estado</th><th>Acceso</th></tr></thead>
              <tbody>
                {dashboard.proximasCoberturas.map((meeting) => (
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
          <div className="empty-state"><CalendarClock size={24} /><p>No tenés coberturas próximas asignadas.</p></div>
        )}
      </section>

      {next ? (
        <section className="next-meeting-detail compact-next-detail">
          <div className="section-heading">
            <div><h2>Detalle de la próxima</h2><p>{formatDateTime(next.inicioAt)} · {next.sala}</p></div>
          </div>
          <dl>
            <div><dt>Modalidad</dt><dd>{next.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</dd></div>
            <div><dt>Duración</dt><dd>{formatMinutes(Math.round((next.finAt.getTime() - next.inicioAt.getTime()) / 60_000))}</dd></div>
            <div><dt>Fin</dt><dd>{formatDateTime(next.finAt)}</dd></div>
          </dl>
          {next.joinUrl ? <MeetLinkActions className="next-meet-link-actions" openClassName="primary-action meet-access" url={next.joinUrl} /> : null}
        </section>
      ) : null}
    </div>
  );
}
