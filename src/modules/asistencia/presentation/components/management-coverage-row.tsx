import { ArrowRight, CheckCircle2, CircleAlert, Clock3, UsersRound } from "lucide-react";
import Link from "next/link";

type CoverageData = Readonly<{
  id: string;
  title: string;
  platform: "Zoom" | "Google Meet" | "Sin plataforma";
  modality: "VIRTUAL" | "HIBRIDA";
  schedule: string;
  classSchedule: string;
  assistantName: string | null;
  applicantsCount: number;
}>;

const platformClasses = {
  Zoom: "is-zoom",
  "Google Meet": "is-meet",
  "Sin plataforma": "is-none"
} as const;

export function ManagementCoverageRow({ data }: Readonly<{ data: CoverageData }>) {
  const covered = data.assistantName !== null;
  const StatusIcon = covered ? CheckCircle2 : CircleAlert;
  return (
    <article className={"management-coverage-card " + (covered ? "is-covered" : "is-pending")}>
      <div className="management-coverage-meta">
        <span>
          <Clock3 size={16} aria-hidden="true" /> {data.schedule}
        </span>
        <span className={"monitoring-platform " + platformClasses[data.platform]}>{data.platform}</span>
        {data.modality === "HIBRIDA" ? <span>Híbrida</span> : null}
      </div>
      <h3>{data.title}</h3>
      {data.schedule !== data.classSchedule ? (
        <small className="management-class-schedule">Horario de clase: {data.classSchedule}</small>
      ) : null}
      <div className={"management-coverage-status " + (covered ? "status-ok" : "status-warning")}>
        <StatusIcon size={17} aria-hidden="true" />
        <div>
          <strong>{covered ? "Asignada" : "Pendiente de monitoreo"}</strong>
          {data.assistantName ? <span>{data.assistantName}</span> : null}
        </div>
      </div>
      <div className="management-coverage-footer">
        <span className="management-applicant-count">
          <UsersRound size={16} aria-hidden="true" />
          {data.applicantsCount} {data.applicantsCount === 1 ? "postulación" : "postulaciones"}
        </span>
        <Link
          className={covered ? "secondary-action" : "primary-action"}
          href={"/monitoreo/gestionar/" + data.id}
          aria-label={(covered ? "Gestionar: " : "Asignar: ") + data.title}
        >
          {covered ? "Gestionar" : "Asignar"}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
