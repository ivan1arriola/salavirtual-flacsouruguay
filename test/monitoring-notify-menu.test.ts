import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("menú de notificaciones masivas", () => {
  it("agrupa las acciones en un menú Notificar", () => {
    const src = readFileSync(
      "src/modules/asistencia/presentation/components/bulk-monitoring-notification-actions.tsx",
      "utf8",
    );
    expect(src).toContain('<details className="coverage-notify-menu"');
    expect(src).toContain("<summary");
    expect(src).toContain("Notificar ▾");
    expect(src).toContain("Renotificar sin asignar ({pendingCount})");
    expect(src).toContain("Notificar reuniones asignadas ({coveredCount})");
    expect(src).toContain('"/api/v1/asistencia/notificaciones"');
  });
});
