import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("prioridades del dashboard de asistentes de monitoreo", () => {
  it("presenta el trabajo asignado antes de oportunidades y resumen de horas", () => {
    const source = readFileSync(
      new URL(
        "../src/modules/asistencia/presentation/components/assistant-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const order = [
      "<LiveMeetingHero",
      '<section className="dashboard-content-section assistant-coverages-section"',
      "<AssistantOpenOpportunities",
      "<AssistantHoursSummary",
    ].map((marker) => source.indexOf(marker));

    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(source).toContain("Próximos monitoreos asignados");
  });
});
