import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAdminSummaryMetrics } from "@/src/modules/dashboard/admin-dashboard-summary";

describe("prioridades del dashboard de administración", () => {
  it("presenta indicadores y alertas antes de la agenda", () => {
    const source = readFileSync(
      new URL("../src/components/dashboard/admin/admin-dashboard.tsx", import.meta.url),
      "utf8",
    );
    const todayIndex = source.indexOf("<AdminTodayTimeline");
    const upcomingIndex = source.indexOf("<AdminUpcomingList");
    const triageIndex = source.indexOf("<AdminTriageSection");
    const metricsIndex = source.indexOf("<AdminMetricsBar");

    expect(todayIndex).toBeGreaterThan(-1);
    expect(metricsIndex).toBeGreaterThan(-1);
    expect(triageIndex).toBeGreaterThan(metricsIndex);
    expect(todayIndex).toBeGreaterThan(triageIndex);
    expect(upcomingIndex).toBeGreaterThan(todayIndex);
  });

  it("muestra indicadores operativos y generales", () => {
    const summary = getAdminSummaryMetrics({
      openRequests: 8,
      todayMeetings: 4,
      weekMeetings: 12,
      pendingAssistance: 2,
      integrationErrors: 1,
      pendingRecordings: 3,
      openIncidents: 1,
      duplicateRisks: 0,
    });

    expect(summary.map(({ label }) => label)).toEqual([
      "Reuniones hoy",
      "Sin monitoreo",
      "Incidencias abiertas",
      "Solicitudes activas",
      "Próximos 7 días",
    ]);
    expect(summary.map(({ value }) => value)).toEqual([4, 2, 1, 8, 12]);
  });

  it("ordena las incidencias antes de cobertura, Meet, grabaciones y duplicados", () => {
    const source = readFileSync(
      new URL("../src/components/dashboard/admin/admin-triage-section.tsx", import.meta.url),
      "utf8",
    );
    const priority = [
      "openIncidents.count > 0",
      "pendingCoverage.count > 0",
      "integrationErrors.count > 0",
      "pendingRecordings.count > 0",
      "duplicateRisks.count > 0",
    ].map((marker) => source.indexOf(marker));

    expect(priority.every((position) => position >= 0)).toBe(true);
    expect(priority).toEqual([...priority].sort((left, right) => left - right));
  });
});
