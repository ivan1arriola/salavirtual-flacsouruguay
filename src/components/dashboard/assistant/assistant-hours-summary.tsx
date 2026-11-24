import { CalendarDays, Clock3, Hourglass, UserCheck } from "lucide-react";
import Link from "next/link";
import { formatMinutes } from "@/src/lib/ui/assistant-format";

export function AssistantHoursSummary({
  stats
}: Readonly<{
  stats: {
    readonly currentMonthMinutes: number;
    readonly currentMonthVirtualMinutes: number;
    readonly currentMonthHybridMinutes: number;
    readonly previousMonthMinutes: number;
    readonly previousMonthVirtualMinutes: number;
    readonly previousMonthHybridMinutes: number;
    readonly postulacionesCount: number;
    readonly pendientesRespuesta: number;
    readonly respondidas: number;
    readonly reunionesDisponibles: number;
  };
}>) {
  return (
    <section className="dashboard-content-section assistant-hours-section">
      <div className="section-heading">
        <div>
          <h2>Resumen operativo y horas</h2>
          <p>Cómputo de horas trabajadas en el período y estado de tus postulaciones.</p>
        </div>
        <Link className="text-link" href="/mi-agenda?tab=historico">
          Consultar horas e historial
        </Link>
      </div>

      <div className="assistant-hours-grid">
        <article className="assistant-stat-card tone-green">
          <div className="assistant-stat-header">
            <span className="assistant-stat-icon">
              <Clock3 size={20} />
            </span>
            <small>Horas registradas este mes</small>
          </div>
          <strong className="assistant-stat-value">{formatMinutes(stats.currentMonthMinutes)} h</strong>
          <p className="assistant-stat-breakdown">
            Virtual {formatMinutes(stats.currentMonthVirtualMinutes)} h · Híbrida{" "}
            {formatMinutes(stats.currentMonthHybridMinutes)} h
          </p>
        </article>

        <article className="assistant-stat-card tone-blue">
          <div className="assistant-stat-header">
            <span className="assistant-stat-icon">
              <CalendarDays size={20} />
            </span>
            <small>Mes anterior</small>
          </div>
          <strong className="assistant-stat-value">{formatMinutes(stats.previousMonthMinutes)} h</strong>
          <p className="assistant-stat-breakdown">
            Virtual {formatMinutes(stats.previousMonthVirtualMinutes)} h · Híbrida{" "}
            {formatMinutes(stats.previousMonthHybridMinutes)} h
          </p>
        </article>

        <article className="assistant-stat-card tone-amber">
          <div className="assistant-stat-header">
            <span className="assistant-stat-icon">
              <Hourglass size={20} />
            </span>
            <small>Mis postulaciones</small>
          </div>
          <strong className="assistant-stat-value">{stats.postulacionesCount}</strong>
          <p className="assistant-stat-breakdown">
            {stats.respondidas} oportunidades respondidas · {stats.pendientesRespuesta} sin responder
          </p>
        </article>

        <article className="assistant-stat-card tone-purple">
          <div className="assistant-stat-header">
            <span className="assistant-stat-icon">
              <UserCheck size={20} />
            </span>
            <small>Salas disponibles</small>
          </div>
          <strong className="assistant-stat-value">{stats.reunionesDisponibles}</strong>
          <p className="assistant-stat-breakdown">Abiertas a postulación en agenda</p>
        </article>
      </div>
    </section>
  );
}
