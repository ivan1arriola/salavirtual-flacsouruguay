import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../src/bootstrap/ui/reuniones/reunion-detail-page.server.tsx", import.meta.url),
  "utf8"
);
const manager = readFileSync(
  new URL("../src/modules/reuniones/presentation/components/meeting-detail-manager.tsx", import.meta.url),
  "utf8"
);
const tabsPath = new URL(
  "../src/modules/reuniones/presentation/components/meeting-detail-tabs.tsx",
  import.meta.url
);
const tabs = existsSync(tabsPath) ? readFileSync(tabsPath, "utf8") : "";
const tabsStyles = readFileSync(
  new URL("../app/(gestion)/meeting-detail-v2.css", import.meta.url),
  "utf8"
);
describe("secciones de la ficha de reunión", () => {
  it("muestra un panel accesible por vez y permite recorrer las pestañas con teclado", () => {
    expect(page).toContain("<MeetingDetailTabs");
    expect(page).not.toContain('<nav className="meeting-section-nav"');
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain('role="tabpanel"');
    expect(tabs).toContain("aria-controls={tab.id}");
    expect(tabs).toContain("id={tab.id}");
    expect(tabs).toContain("hidden={!selected}");
    expect(tabs).toContain('event.key === "ArrowRight"');
    expect(tabs).toContain('event.key === "ArrowLeft"');
    expect(tabs).toContain('event.key === "Home"');
    expect(tabs).toContain('event.key === "End"');
    expect(tabs).toContain("window.history.pushState");
    expect(tabsStyles).toContain('.meeting-detail-section[hidden] { display: none; }');
    expect(tabsStyles).toContain("overflow-x: auto;");
    expect(tabsStyles).toContain("min-height: 44px;");
    const source = `${page}\n${manager}\n${tabs}`;
    for (const section of ["general", "encuentros", "personas", "archivos", "actividad"]) {
      expect(source).toContain(`id: "${section}"`);
    }
  });

  it("mantiene los archivos vinculados a los encuentros de los que provienen", () => {
    expect(page).toContain("meetingViews.map");
    expect(page).toContain("grabacionUrl");
    expect(page).toContain("asistenciaUrl");
    expect(page).toContain("driveFolderUrl");
  });

  it("ubica archivos y planillas en Archivos y las incidencias en Actividad", () => {
    expect(page).toContain("<MeetingIntegrationProblems");
    expect(page.indexOf("<MeetAttendanceEmails")).toBeGreaterThan(page.indexOf('id: "archivos"'));
    expect(page.indexOf("<MeetAttendanceEmails")).toBeLessThan(page.indexOf('id: "actividad"'));
    expect(page).toContain("Estado actual de las integraciones");
    expect(manager).not.toContain("encounter-v2-artifacts");
  });
});
