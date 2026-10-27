import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../src/bootstrap/ui/reuniones/reunion-detail-page.server.tsx", import.meta.url),
  "utf8"
);
const manager = readFileSync(
  new URL("../src/modules/reuniones/presentation/components/meeting-detail-manager.tsx", import.meta.url),
  "utf8"
);
const layout = readFileSync(
  new URL("../src/modules/reuniones/presentation/components/meeting-detail-tabs.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(
  new URL("../app/(gestion)/meeting-detail-mobile-continuous.css", import.meta.url),
  "utf8"
);
const admin = readFileSync(
  new URL("../src/modules/reuniones/presentation/components/series-management.tsx", import.meta.url),
  "utf8"
);
describe("secciones de la ficha de reunión", () => {
  it("muestra todas las secciones en mosaico sin paneles ocultos", () => {
    expect(page).toContain("<MeetingDetailTabs");
    expect(layout).toContain('className="meeting-mosaic-layout"');
    expect(layout).toContain('className="meeting-mosaic-columns"');
    expect(layout).toContain('className="meeting-mosaic-primary"');
    expect(layout).toContain('className="meeting-mosaic-secondary"');
    expect(layout).toContain("renderSection(general, 0)");
    expect(layout).toContain("renderSection(encuentros, 1)");
    expect(layout).toContain("renderSection(personas, 2)");
    expect(layout).toContain("renderSection(archivos, 3)");
    expect(layout).toContain("renderSection(actividad, 4)");
    expect(layout).not.toContain('role="tablist"');
    expect(layout).not.toContain('role="tabpanel"');
    expect(layout).not.toContain("hidden={!selected}");
    expect(styles).toContain("container-type: inline-size");
    expect(styles).toContain("@container (max-width: 930px)");
    expect(styles).toContain(".meeting-mosaic-columns { grid-template-columns: minmax(0, 1fr); }");
  });

  it("permite consultar todas las secciones en una página continua en móvil", () => {
    expect(layout).toContain('id="secciones-reunion"');
    expect(layout).toContain('href={`#${tab.id}`}');
    expect(layout).toContain('id={section.id}');
    expect(layout).toContain('tabIndex={-1}');
    expect(styles).toContain("@media (max-width: 760px)");
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain(".meeting-mobile-outline");
    expect(styles).toContain("scroll-margin-top:");
    const source = `${page}\n${manager}\n${layout}`;
    for (const section of ["general", "encuentros", "personas", "archivos", "actividad"]) {
      expect(source).toContain(`id: "${section}"`);
    }
  });

  it("sustituye también las pestañas internas de Personas por paneles desplegables", () => {
    expect(admin).not.toContain('role="tablist"');
    expect(admin).not.toContain('setTab(');
    expect(admin).toContain('className="series-management-tool-disclosure"');
    expect(styles).toContain(".series-management-tool-disclosure > summary");
  });

  it("mantiene los archivos vinculados a los encuentros de los que provienen", () => {
    expect(page).toContain("meetingViews.map");
    expect(page).toContain("grabacionUrl");
    expect(page).toContain("asistenciaUrl");
    expect(page).toContain("driveFolderUrl");
  });

  it("no muestra el acceso a la asistencia de encuentros que todavía no ocurrieron", () => {
    const enlace = manager.indexOf('className="encounter-attendance-link"');
    expect(enlace).toBeGreaterThan(-1);
    expect(manager.slice(Math.max(0, enlace - 140), enlace)).toContain('meeting.temporalidad !== "FUTURO"');
  });

  it("ubica archivos y planillas en Archivos y las incidencias en Actividad", () => {
    expect(page).toContain("<MeetingIntegrationProblems");
    expect(page.indexOf("<MeetAttendanceEmails")).toBeGreaterThan(page.indexOf('id: "archivos"'));
    expect(page.indexOf("<MeetAttendanceEmails")).toBeLessThan(page.indexOf('id: "actividad"'));
    expect(page).toContain("Estado actual de las integraciones");
    expect(manager).not.toContain("encounter-v2-artifacts");
  });
});
