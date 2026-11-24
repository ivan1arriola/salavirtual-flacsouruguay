import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Files,
  GitCompareArrows,
  Siren,
  UserRoundCheck
} from "lucide-react";
import Link from "next/link";
import {
  AdminQuickAssignAction,
  AdminRetryMeetAction,
  AdminSyncRecordingsAction
} from "@/src/components/admin-attention-actions";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import type { AdminDashboardData } from "@/src/modules/dashboard/admin-dashboard.adapter";

export function AdminTriageSection({
  attentionData
}: Readonly<{
  attentionData: AdminDashboardData["attentionData"];
}>) {
  const { pendingCoverage, integrationErrors, pendingRecordings, openIncidents, duplicateRisks } =
    attentionData;

  const totalUrgent =
    pendingCoverage.count +
    integrationErrors.count +
    pendingRecordings.count +
    openIncidents.count +
    duplicateRisks.count;

  return (
    <section className="dashboard-content-section admin-triage-section" aria-labelledby="admin-triage-title">
      <div className="section-heading admin-dashboard-section-heading">
        <div className="admin-section-heading-copy">
          <span className="admin-section-icon is-attention">
            <Siren aria-hidden="true" size={20} />
          </span>
          <div>
            <h2 id="admin-triage-title">Alertas y pendientes</h2>
            <p>Casos operativos que requieren intervención.</p>
          </div>
        </div>
        {totalUrgent > 0 ? (
          <span className="triage-total-badge" title="Total de casos a resolver">
            {totalUrgent} {totalUrgent === 1 ? "caso" : "casos"}
          </span>
        ) : (
          <span className="triage-clear-badge">
            <CheckCircle2 size={16} /> Todo al día
          </span>
        )}
      </div>

      {totalUrgent === 0 ? (
        <div className="operations-all-clear">
          <CheckCircle2 size={24} />
          <div>
            <strong>Todo bajo control</strong>
            <p>No hay excepciones operativas que requieran intervención inmediata en las salas de FLACSO.</p>
          </div>
        </div>
      ) : (
        <div className="operations-attention-grid">
          {openIncidents.count > 0 ? (
            <article className="operations-attention-card tone-danger">
              <div className="operations-attention-card-heading">
                <span>
                  <Siren size={18} />
                </span>
                <div>
                  <strong>Incidencias abiertas</strong>
                  <small>
                    {openIncidents.count} {openIncidents.count === 1 ? "caso" : "casos"}
                  </small>
                </div>
              </div>
              <ul>
                {openIncidents.examples.map((item) => (
                  <li key={item.id}>
                    {item.title} · {item.description}
                  </li>
                ))}
              </ul>
              <Link
                className="text-link"
                href={
                  openIncidents.firstIncidentSolicitudId
                    ? `/reuniones/${openIncidents.firstIncidentSolicitudId}`
                    : "/reuniones"
                }
              >
                Revisar incidencias <ArrowRight size={15} />
              </Link>
            </article>
          ) : null}

          {pendingCoverage.count > 0 ? (
            <article className="operations-attention-card tone-warning">
              <div className="operations-attention-card-heading">
                <span>
                  <UserRoundCheck size={18} />
                </span>
                <div>
                  <strong>Reuniones sin monitoreo</strong>
                  <small>
                    {pendingCoverage.count} {pendingCoverage.count === 1 ? "caso" : "casos"}
                  </small>
                </div>
              </div>
              <ul>
                {pendingCoverage.examples.map((item) => (
                  <li key={item.id}>
                    {item.title} · {formatDate(new Date(item.time))} {formatTime(new Date(item.time))}
                  </li>
                ))}
              </ul>
              {pendingCoverage.firstMeetingId ? (
                <AdminQuickAssignAction
                  assistants={pendingCoverage.assistants}
                  firstApplicant={pendingCoverage.firstApplicant}
                  meetingId={pendingCoverage.firstMeetingId}
                />
              ) : null}
              <Link className="text-link" href="/monitoreo?estado=pendientes">
                Gestionar monitoreo <ArrowRight size={15} />
              </Link>
            </article>
          ) : null}

          {integrationErrors.count > 0 ? (
            <article className="operations-attention-card tone-danger">
              <div className="operations-attention-card-heading">
                <span>
                  <CircleAlert size={18} />
                </span>
                <div>
                  <strong>Errores de Google Meet</strong>
                  <small>
                    {integrationErrors.count} {integrationErrors.count === 1 ? "caso" : "casos"}
                  </small>
                </div>
              </div>
              <ul>
                {integrationErrors.examples.map((item) => (
                  <li key={item.id}>
                    {item.title} · {item.error}
                  </li>
                ))}
              </ul>
              <AdminRetryMeetAction />
              <Link className="text-link" href="/configuracion">
                Configuración de Meet <ArrowRight size={15} />
              </Link>
            </article>
          ) : null}

          {pendingRecordings.count > 0 ? (
            <article className="operations-attention-card tone-neutral">
              <div className="operations-attention-card-heading">
                <span>
                  <Files size={18} />
                </span>
                <div>
                  <strong>Grabaciones pendientes de sincronización</strong>
                  <small>
                    {pendingRecordings.count} {pendingRecordings.count === 1 ? "caso" : "casos"}
                  </small>
                </div>
              </div>
              <ul>
                {pendingRecordings.examples.map((item) => (
                  <li key={item.id}>
                    {item.title} · {formatDate(new Date(item.date))}
                  </li>
                ))}
              </ul>
              <AdminSyncRecordingsAction />
              <Link className="text-link" href="/grabaciones">
                Ver biblioteca de grabaciones <ArrowRight size={15} />
              </Link>
            </article>
          ) : null}

          {duplicateRisks.count > 0 ? (
            <article className="operations-attention-card tone-danger">
              <div className="operations-attention-card-heading">
                <span>
                  <GitCompareArrows size={18} />
                </span>
                <div>
                  <strong>Posibles reuniones duplicadas</strong>
                  <small>
                    {duplicateRisks.count} {duplicateRisks.count === 1 ? "caso" : "casos"}
                  </small>
                </div>
              </div>
              <ul>
                {duplicateRisks.examples.map((item, index) => (
                  <li key={`dup-${index}`}>
                    {item.leftTitle} / {item.rightTitle}
                  </li>
                ))}
              </ul>
              <Link className="text-link" href="/reuniones/duplicados">
                Comparar y unificar <ArrowRight size={15} />
              </Link>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}
