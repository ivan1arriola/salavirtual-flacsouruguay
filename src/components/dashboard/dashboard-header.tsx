import type { ReactNode } from "react";
import { formatShortDate } from "@/src/lib/ui/format";

export function DashboardHeader({
  userName,
  role,
  subtitle,
  actions
}: Readonly<{
  userName: string;
  role: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
  subtitle?: string;
  actions?: ReactNode;
}>) {
  const roleLabels: Record<string, string> = {
    ADMINISTRACION: "Administración",
    DOCENTE: "Cuerpo Docente",
    ASISTENTE_TECNICO: "Monitoreo"
  };

  const defaultSubtitles: Record<string, string> = {
    ADMINISTRACION: "Supervisión de salas, triage operativo y agenda institucional.",
    DOCENTE: "Tus clases, accesos rápidos a Google Meet y grabaciones de cursos.",
    ASISTENTE_TECNICO: "Tus coberturas asignadas, vacantes abiertas y registro de horas."
  };

  const now = new Date();
  const firstName = userName.trim().split(" ")[0] || "Docente";

  return (
    <header className="dashboard-header-hero">
      <div className="dashboard-header-info">
        <div className="dashboard-header-meta">
          <span className="dashboard-header-date">{formatShortDate(now)}</span>
          <span className={`dashboard-header-role-badge role-${role.toLowerCase()}`}>
            {roleLabels[role] ?? role}
          </span>
        </div>
        <h1 className="dashboard-header-title">Hola, {firstName}</h1>
        <p className="dashboard-header-subtitle">
          {subtitle ?? defaultSubtitles[role] ?? ""}
        </p>
      </div>

      {actions ? <div className="dashboard-header-actions">{actions}</div> : null}
    </header>
  );
}

