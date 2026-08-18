import { AlertTriangle, Clock3 } from "lucide-react";

type MeetIntegrationStatusProps = Readonly<{
  status?: "PENDIENTE" | "SINCRONIZADA" | "ERROR" | "HISTORICA";
  hasMeet?: boolean;
}>;

export function MeetIntegrationStatus({ status, hasMeet = false }: MeetIntegrationStatusProps) {
  if (status === "PENDIENTE") {
    return (
      <span className="status status-warning">
        <Clock3 size={14} aria-hidden="true" /> Meet pendiente
      </span>
    );
  }

  if (status === "ERROR" && hasMeet) {
    return (
      <span className="status status-warning">
        <AlertTriangle size={14} aria-hidden="true" /> Configuración de Meet pendiente
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

  return null;
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
