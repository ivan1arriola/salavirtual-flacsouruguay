import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  UsersRound,
} from "lucide-react";
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

function etiquetaPlataforma(plataforma: MonitoringMeetingRowData["plataforma"]): string {
  switch (plataforma) {
    case "ZOOM":
      return "Zoom";
    case "GOOGLE_MEET":
      return "Google Meet";
    default:
      return "Sin plataforma";
  }
}

function clasePlataforma(plataforma: MonitoringMeetingRowData["plataforma"]): string {
  switch (plataforma) {
    case "ZOOM":
      return "is-zoom";
    case "GOOGLE_MEET":
      return "is-meet";
    default:
      return "is-none";
  }
}

function estadoAsignacion(covered: boolean, assistantName: string | null) {
  if (covered) {
    return {
      className: "status-ok",
      label: "Cubierta",
      description: assistantName,
      Icon: CheckCircle2,
    };
  }
  return {
    className: "status-warning",
    label: "Pendiente",
    description: "Necesita asignación",
    Icon: CircleAlert,
  };
}

function accionGestion(covered: boolean) {
  if (covered) {
    return { className: "secondary-action", label: "Gestionar" };
  }
  return { className: "primary-action", label: "Asignar" };
}

export function MonitoringMeetingRow({ data }: Readonly<{ data: MonitoringMeetingRowData }>) {
  const isZoom = data.plataforma === "ZOOM";
  const platformLabel = etiquetaPlataforma(data.plataforma);
  const platformClass = clasePlataforma(data.plataforma);
  const hostTitle = isZoom ? "Host de Zoom" : "Cuenta de Meet";
  const assignmentStatus = estadoAsignacion(data.covered, data.assistantName);
  const action = accionGestion(data.covered);
  const StatusIcon = assignmentStatus.Icon;
  const provider = isZoom ? "ZOOM" : "GOOGLE_MEET";

  return (
    <article
      className={
        "monitoring-row monitoring-account-card " + (data.covered ? "is-covered" : "is-pending")
      }
      data-cuenta={data.cuenta}
    >
      <div className="monitoring-row-main">
        <span className="monitoring-row-time">
          <Clock3 size={15} aria-hidden="true" />
          {data.horaAsistencia}
        </span>
        <div className="monitoring-row-title">
          <span className={"monitoring-platform " + platformClass}>{platformLabel}</span>
          <Link className="coverage-title-link" href={data.detalleHref}>
            {data.titulo}
          </Link>
          <small>
            {data.programa} · {data.docente}
          </small>
        </div>
        <span className={"monitoring-row-status " + assignmentStatus.className}>
          <StatusIcon size={16} aria-hidden="true" />
          <span>{assignmentStatus.label}</span>
          <small>{assignmentStatus.description}</small>
        </span>
        <span
          className="monitoring-row-applicants"
          aria-label={
            data.applicantsCount +
            (data.applicantsCount === 1 ? " persona postulada" : " personas postuladas")
          }
        >
          <UsersRound size={15} aria-hidden="true" />
          <strong>{data.applicantsCount}</strong>
          <small>{data.applicantsCount === 1 ? "postulada" : "postuladas"}</small>
        </span>
        <Link className={action.className} href={data.gestionarHref}>
          {action.label}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>

      <details className="monitoring-row-details">
        <summary>
          <ChevronDown size={15} aria-hidden="true" />
          Más detalles del encuentro
        </summary>
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
            {data.applicantsCount}{" "}
            {data.applicantsCount === 1 ? "persona postulada" : "personas postuladas"}
          </span>
          <div className="coverage-quick-links">
            {data.joinUrl ? (
              <MeetLinkActions url={data.joinUrl} provider={provider} />
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
