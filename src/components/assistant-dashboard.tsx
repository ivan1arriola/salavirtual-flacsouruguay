import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Hand,
  Hourglass
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { MeetingCountdown } from "./meeting-countdown";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes } from "@/src/lib/ui/assistant-format";
import { formatDateTime } from "@/src/lib/ui/format";
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
    { label: "Mis postulaciones", value: dashboard.postulaciones, copy: "Eventos donde marcaste interés.", icon: Hourglass, tone: "amber" },
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

      {next ? (
        <section className="next-meeting-detail">
          <div className="section-heading">
            <div><h2>Detalle de próxima reunión</h2><p>Información útil para ingresar y asistir a la sesión.</p></div>
            <MeetingCountdown startAt={next.inicioAt.toISOString()} />
          </div>
          <dl>
            <div><dt>Modalidad</dt><dd>{next.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</dd></div>
            <div><dt>Duración</dt><dd>{formatMinutes(Math.round((next.finAt.getTime() - next.inicioAt.getTime()) / 60_000))}</dd></div>
            <div><dt>Inicio</dt><dd>{formatDateTime(next.inicioAt)}</dd></div>
            <div><dt>Fin</dt><dd>{formatDateTime(next.finAt)}</dd></div>
            <div><dt>Sala</dt><dd>{next.sala}</dd></div>
          </dl>
          {next.joinUrl ? <a className="primary-action meet-access" href={next.joinUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} />Abrir Meet</a> : null}
        </section>
      ) : null}
    </div>
  );
}
