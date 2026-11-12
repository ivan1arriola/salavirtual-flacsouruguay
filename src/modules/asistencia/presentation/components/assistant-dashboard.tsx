import { Activity, ArrowRight, CalendarPlus, CalendarRange } from "lucide-react";
import Link from "next/link";
import { CopyMeetLinkButton } from "@/src/components/copy-meet-link-button";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { AssistantHoursSummary } from "@/src/components/dashboard/assistant/assistant-hours-summary";
import { AssistantOpenOpportunities } from "@/src/components/dashboard/assistant/assistant-open-opportunities";
import { DashboardHeader } from "@/src/components/dashboard/dashboard-header";
import { LiveMeetingHero } from "@/src/components/dashboard/live-meeting-hero";
import { ASSISTANT_AGENDA_HREF } from "@/src/components/app-navigation";
import { formatDate } from "@/src/lib/ui/format";
import type { AssistantDashboardData } from "@/src/modules/dashboard/types";

export function AssistantDashboardView({
  data,
  userName
}: Readonly<{
  data: AssistantDashboardData;
  userName: string;
}>) {
  return (
    <div className="role-dashboard assistant-dashboard-redesigned" data-tour="assistant-dashboard">
      <DashboardHeader
        actions={
          <>
            <Link className="secondary-action" href={ASSISTANT_AGENDA_HREF}>
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
        userName={userName}
      />

      <LiveMeetingHero
        emptyStateActionHref="/agenda-abierta"
        emptyStateActionLabel="Explorar agenda abierta"
        emptyStateCopy="No tenés reuniones asignadas para hoy. Consultá las instancias que necesitan soporte técnico para postularte."
        emptyStateTitle="Sin coberturas asignadas hoy"
        meeting={data.heroMeeting}
        role="ASISTENTE_TECNICO"
      />

      {data.upcomingCoverages.length > 0 ? (
        <section className="dashboard-content-section assistant-coverages-section">
          <div className="section-heading">
            <div>
              <h2>Próximos monitoreos asignados</h2>
              <p>Tus próximas reuniones asignadas a continuación.</p>
            </div>
            <Link className="text-link" href={ASSISTANT_AGENDA_HREF}>
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
                    <MeetingScheduleTimes
                      startsAt={inicio}
                      endsAt={fin}
                      requiresAssistance
                      modality={cov.modalidad}
                      assistanceStartsAt={cov.inicioAsistenciaAt}
                      assistanceEndsAt={cov.finAsistenciaAt}
                      viewerIsAssistant
                      compact
                    />
                    <span className="badge-tag">{cov.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
                  </div>

                  <div className="assistant-coverage-content">
                    <small>{cov.programa}</small>
                    <h3>
                      <Link href={`/reuniones/${cov.solicitudId}`}>{cov.titulo}</Link>
                    </h3>
                  </div>

                  <div className="assistant-coverage-actions">
                    <Link className="secondary-action" href={`/operacion/${cov.id}`}>
                      <Activity size={15} />
                      Operar
                    </Link>
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

      <AssistantOpenOpportunities opportunities={data.openOpportunities} />

      <AssistantHoursSummary stats={data.stats} />
    </div>
  );
}
