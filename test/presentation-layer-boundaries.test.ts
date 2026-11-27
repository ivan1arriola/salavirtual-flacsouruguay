import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const assistanceComponents = [
  "assistant-assignment-control.tsx",
  "assistant-assignment-select.tsx",
  "assistant-dashboard.tsx",
  "assistant-history.tsx",
  "assistant-interest-button.tsx",
  "assistant-meetings-table.tsx",
  "assistant-month-list.tsx",
  "assistant-onboarding-tour.tsx",
  "assistant-period-nav.tsx",
  "assistant-report-config-form.tsx",
  "assistant-tutorial-button.tsx",
  "assistant-unassign-button.tsx",
  "coverage-assistance-actions.tsx",
] as const;

const meetingComponents = [
  "meeting-countdown.tsx",
  "meeting-creation-dialog.tsx",
  "meeting-detail-manager.tsx",
  "meeting-form-v2.tsx",
  "meeting-form-zoom.tsx",
  "meeting-integration-problems.tsx",
  "reunion-zoom-encuentros.tsx",
  "series-management.tsx",
] as const;

describe("capa de presentacion modular", () => {
  it("ubica los componentes de asistencia y reuniones dentro de sus modulos", () => {
    for (const file of assistanceComponents) {
      expect(
        existsSync(join(root, "src/modules/asistencia/presentation/components", file)),
        file,
      ).toBe(true);
    }
    for (const file of meetingComponents) {
      expect(
        existsSync(join(root, "src/modules/reuniones/presentation/components", file)),
        file,
      ).toBe(true);
    }

    const dashboard = readFileSync(
      join(root, "src/modules/asistencia/presentation/components/assistant-dashboard.tsx"),
      "utf8",
    );
    expect(dashboard).not.toContain("@/src/components/dashboard/assistant/assistant-dashboard");
    expect(dashboard).not.toContain("@/src/lib/db");
    expect(dashboard).not.toContain("assistant-dashboard.adapter");
  });

  it("hace que app consuma las APIs publicas de presentacion", () => {
    const files = [
      "app/(gestion)/agenda-abierta/page.tsx",
      "app/(gestion)/asistencia-tecnica/page.tsx",
      "app/(gestion)/asistentes/page.tsx",
      "app/(gestion)/asistentes/[usuarioId]/page.tsx",
      "app/(gestion)/mi-agenda/page.tsx",
      "app/(gestion)/reuniones/nueva/page.tsx",
      "app/(gestion)/reuniones/[solicitudId]/page.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).not.toMatch(
        /@\/src\/components\/(?:assistant-|coverage-assistance|meeting-|series-management)/,
      );
    }
  });

  it("expone los componentes Zoom de reuniones en la fachada pública", () => {
    const fachada = readFileSync(join(root, "src/modules/reuniones/presentation.ts"), "utf8");
    expect(fachada).toContain("MeetingFormZoom");
    expect(fachada).toContain("ReunionZoomEncuentros");
  });

  it("elimina fachadas legacy de presentacion sin consumidores", () => {
    const files = [
      ...assistanceComponents.map((file) => `src/components/${file}`),
      ...meetingComponents.map((file) => `src/components/${file}`),
    ];

    for (const file of files) {
      expect(existsSync(join(root, file)), file).toBe(false);
    }
  });

  it("mantiene delgadas las rutas de reuniones y asistencia", () => {
    const files = [
      "app/(gestion)/agenda-abierta/page.tsx",
      "app/(gestion)/asistencia-tecnica/page.tsx",
      "app/(gestion)/asistentes/page.tsx",
      "app/(gestion)/asistentes/[usuarioId]/page.tsx",
      "app/(gestion)/mi-agenda/page.tsx",
      "app/(gestion)/reuniones/page.tsx",
      "app/(gestion)/reuniones/nueva/page.tsx",
      "app/(gestion)/reuniones/[solicitudId]/page.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      const nonEmptyLines = source.split("\n").filter((line) => line.trim()).length;
      expect(source, file).toContain("@/src/bootstrap/ui/");
      expect(nonEmptyLines, file).toBeLessThanOrEqual(20);
    }
  });
});
