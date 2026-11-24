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
    DOCENTE: "Docente",
    ASISTENTE_TECNICO: "Asistente técnico"
  };

  const defaultSubtitles: Record<string, string> = {
    ADMINISTRACION: "Reuniones, coberturas e incidencias que requieren tu atención.",
    DOCENTE: "Tus clases, enlaces de acceso y grabaciones recientes.",
    ASISTENTE_TECNICO: "Tus monitoreos, postulaciones y registro de horas."
  };

  const now = new Date();
  const firstName = userName.trim().split(" ")[0] || roleLabels[role];
  const titles = {
    ADMINISTRACION: "Panel de operaciones",
    DOCENTE: "Mi actividad académica",
    ASISTENTE_TECNICO: "Mi jornada"
  };

  return (
    <header className="dashboard-header-hero">
      <div className="dashboard-header-info">
        <div className="dashboard-header-meta">
          <span className="dashboard-header-date">{formatShortDate(now)}</span>
          <span className={`dashboard-header-role-badge role-${role.toLowerCase()}`}>
            {roleLabels[role] ?? role}
          </span>
        </div>
        <h1 className="dashboard-header-title">{titles[role]}</h1>
        <p className="dashboard-header-greeting">Hola, {firstName}</p>
        <p className="dashboard-header-subtitle">{subtitle ?? defaultSubtitles[role] ?? ""}</p>
      </div>

      {actions ? <div className="dashboard-header-actions">{actions}</div> : null}
    </header>
  );
}
