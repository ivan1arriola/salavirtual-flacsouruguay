import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

type MeetIntegrationStatusProps = Readonly<{
  status?: "PENDIENTE" | "SINCRONIZADA" | "ERROR" | "HISTORICA";
}>;

export function MeetIntegrationStatus({ status }: MeetIntegrationStatusProps) {
  if (status === "PENDIENTE") {
    return (
      <span className="status status-warning">
        <Clock3 size={14} aria-hidden="true" /> Reserva · Meet pendiente
      </span>
    );
  }

  if (status === "SINCRONIZADA") {
    return (
      <span className="status status-ok">
        <CheckCircle2 size={14} aria-hidden="true" /> Meet creado
      </span>
    );
  }

  if (status === "ERROR") {
    return (
      <span className="status status-error">
        <AlertTriangle size={14} aria-hidden="true" /> Error de Meet
      </span>
    );
  }

  return <span className="status status-neutral">Sin reserva Meet</span>;
}

export function MeetPendingNotice() {
  return (
    <div className="integration-notice" role="status">
      <Clock3 size={19} aria-hidden="true" />
      <p>
        <strong>Las salas asignadas son reservas internas.</strong>{" "}
        “Meet pendiente” indica que todavía no existe código ni enlace de acceso.
      </p>
    </div>
  );
}
