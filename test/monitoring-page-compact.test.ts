import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("página de monitoreo compacta", () => {
  const page = readFileSync("src/bootstrap/ui/asistencia/asistencia-tecnica-page.server.tsx", "utf8");
  const css = readFileSync("app/(gestion)/operations.css", "utf8");

  it("usa un dashboard con resumen, filtros y filas compactas", () => {
    expect(page).toContain("MonitoringSummary");
    expect(page).toContain("MonitoringMeetingRow");
    expect(page).not.toContain("coverage-card monitoring-account-card");
    expect(page).not.toContain("metric-grid coverage-stats");
    expect(page).not.toContain("coverage-card-footer");
    expect(page).toContain('"/monitoreo/gestionar/" + meeting.id');
    expect(page).toContain("applicantsCount={applicantsCount}");
    expect(page).toContain("monitoring-status-filters");
    expect(page).toContain("monitoring-empty-state");
    expect(css).toContain(".monitoring-dashboard-summary");
    expect(css).toContain(".monitoring-row-applicants");
  });

  it("define los estilos nuevos", () => {
    for (const selector of [
      ".monitoring-row",
      ".monitoring-row.is-pending",
      ".coverage-notify-menu",
      ".monitoring-summary",
      ".coverage-toolbar"
    ]) {
      expect(css).toContain(selector);
    }
  });
});
