import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";

export type MonitoringMeetingRowData = {
  id: string;
  detalleHref: string;
  gestionarHref: string;
  titulo: string;
  programa: string;
  docente: string;
  horaAsistencia: string;
  covered: boolean;
  assistantName: string | null;
  plataforma: "ZOOM" | "GOOGLE_MEET" | null;
  joinUrl: string | null;
  hostLabel: string | null;
  codigoReunion: string | null;
  modalidad: "HIBRIDA" | "VIRTUAL";
  horarioReunion: string | null;
  applicantsCount: number;
  cuenta: string;
};

export function MonitoringMeetingRow({ data }: Readonly<{ data: MonitoringMeetingRowData }>) {
  const isZoom = data.plataforma === "ZOOM";
  const platformLabel = isZoom ? "Zoom" : data.plataforma ? "Google Meet" : "Sin plataforma";
  const hostTitle = isZoom ? "Host de Zoom" : "Cuenta de Meet";

  return (
    <article
      className={`monitoring-row monitoring-account-card ${data.covered ? "is-covered" : "is-pending"}`}
      data-cuenta={data.cuenta}
    >
      <div className="monitoring-row-main">
        <span className="monitoring-row-time">{data.horaAsistencia}</span>
        <div className="monitoring-row-title">
          <span className={`monitoring-platform ${isZoom ? "is-zoom" : "is-meet"}`}>{platformLabel}</span>
          <Link className="coverage-title-link" href={data.detalleHref}>
            {data.titulo}
          </Link>
          <small>
            {data.programa} · {data.docente}
          </small>
        </div>
        <span className={`monitoring-row-status ${data.covered ? "status-ok" : "status-warning"}`}>
          {data.covered ? data.assistantName : "Sin asignar"}
        </span>
        <Link className={data.covered ? "secondary-action" : "primary-action"} href={data.gestionarHref}>
          {data.covered ? "Gestionar" : "Asignar"}
        </Link>
      </div>

      <details className="monitoring-row-details">
        <summary>Detalles</summary>
        <div className="monitoring-row-details-body">
          <span>
            <strong>{hostTitle}</strong> {data.hostLabel ?? "Sin cuenta host asignada"}
          </span>
          {isZoom && data.codigoReunion ? (
            <span>
              <strong>N.º de reunión</strong> {data.codigoReunion}
            </span>
          ) : null}
          <span>
            <strong>Modalidad</strong> {data.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
          </span>
          {data.modalidad === "HIBRIDA" && data.horarioReunion ? (
            <span>
              <strong>Horario de reunión</strong> {data.horarioReunion}
            </span>
          ) : null}
          <span>
            {data.applicantsCount} {data.applicantsCount === 1 ? "persona postulada" : "personas postuladas"}
          </span>
          <div className="coverage-quick-links">
            {data.joinUrl ? (
              <MeetLinkActions url={data.joinUrl} provider={isZoom ? "ZOOM" : "GOOGLE_MEET"} />
            ) : (
              <span className="muted-text">Enlace pendiente</span>
            )}
            <Link className="text-link" href={data.detalleHref}>
              Ver detalle <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </details>
    </article>
  );
}
