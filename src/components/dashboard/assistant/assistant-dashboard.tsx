import { ArrowRight, CalendarDays, CalendarPlus, CalendarRange } from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyMeetLinkButton } from "@/src/components/copy-meet-link-button";
import { AssistantHoursSummary } from "@/src/components/dashboard/assistant/assistant-hours-summary";
import { AssistantOpenOpportunities } from "@/src/components/dashboard/assistant/assistant-open-opportunities";
import { DashboardHeader } from "@/src/components/dashboard/dashboard-header";
import { LiveMeetingHero } from "@/src/components/dashboard/live-meeting-hero";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { obtenerDashboardAsistenteOptimizado } from "@/src/modules/dashboard/assistant-dashboard.adapter";

export async function AssistantDashboard({
  user
}: Readonly<{
  user: Session["user"];
}>) {
  const actor = await resolveSessionActor(db, { id: user.id, email: user.email });
  if (!actor?.activo || actor.rol !== "ASISTENTE_TECNICO") redirect("/");

  const ahora = new Date();
  const data = await obtenerDashboardAsistenteOptimizado(db, actor.id, ahora);
  if (!data) redirect("/mi-perfil");

  return (
    <div className="role-dashboard assistant-dashboard-redesigned" data-tour="assistant-dashboard">
      <DashboardHeader
        actions={
          <>
            <Link className="secondary-action" href="/mi-agenda">
              <CalendarRange size={16} />
              <span>Mi agenda</span>
            </Link>
            <Link className="primary-action" href="/agenda-abierta">
              <CalendarPlus size={16} />
              <span>Agenda abierta</span>
            </Link>
          </>
        }
        role="ASISTENTE_TECNICO"
        userName={user.name ?? "Asistente"}
      />

      <LiveMeetingHero
        emptyStateActionHref="/agenda-abierta"
        emptyStateActionLabel="Explorar agenda abierta"
        emptyStateCopy="No tenés reuniones asignadas para hoy. Consultá las instancias que necesitan soporte técnico para postularte."
        emptyStateTitle="Sin coberturas asignadas hoy"
        meeting={data.heroMeeting}
        role="ASISTENTE_TECNICO"
      />

      <AssistantOpenOpportunities opportunities={data.openOpportunities} />

      <AssistantHoursSummary stats={data.stats} />

      {data.upcomingCoverages.length > 0 ? (
        <section className="dashboard-content-section assistant-coverages-section">
          <div className="section-heading">
            <div>
              <h2>Siguientes coberturas programadas</h2>
              <p>Tus próximas reuniones asignadas a continuación.</p>
            </div>
            <Link className="text-link" href="/mi-agenda">
              Ver agenda completa <ArrowRight size={16} />
            </Link>
          </div>

          <div className="assistant-coverages-grid">
            {data.upcomingCoverages.map((cov) => {
              const inicio = new Date(cov.inicioProgramadoAt);
              const fin = new Date(cov.finProgramadoAt);
              return (
                <article className="assistant-coverage-card" key={cov.id}>
                  <div className="assistant-coverage-when">
                    <span>{formatDate(inicio)}</span>
                    <strong>
                      {formatTime(inicio)}–{formatTime(fin)}
                    </strong>
                    <span className="badge-tag">
                      {cov.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                    </span>
                  </div>

                  <div className="assistant-coverage-content">
                    <small>{cov.programa}</small>
                    <h3>
                      <Link href={`/reuniones/${cov.solicitudId}`}>{cov.titulo}</Link>
                    </h3>
                  </div>

                  <div className="assistant-coverage-actions">
                    {cov.joinUrl ? (
                      <CopyMeetLinkButton url={cov.joinUrl} />
                    ) : (
                      <span className="status-muted">Link pendiente</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

