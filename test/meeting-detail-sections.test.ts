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

describe("secciones de la ficha de reunión", () => {
  it("ofrece navegación accesible hacia las cinco áreas de trabajo", () => {
    expect(page).toContain('<nav className="meeting-section-nav" aria-label={"Secciones de la reuni');
    const source = `${page}\n${manager}`;
    for (const section of ["general", "encuentros", "personas", "archivos", "actividad"]) {
      expect(page).toContain(`href="#${section}"`);
      expect(source).toContain(`id="${section}"`);
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
    expect(page.indexOf("<MeetAttendanceEmails")).toBeGreaterThan(page.indexOf('id="archivos"'));
    expect(page.indexOf("<MeetAttendanceEmails")).toBeLessThan(page.indexOf('id="actividad"'));
    expect(page).toContain("Estado actual de las integraciones");
    expect(manager).not.toContain("encounter-v2-artifacts");
  });
});
