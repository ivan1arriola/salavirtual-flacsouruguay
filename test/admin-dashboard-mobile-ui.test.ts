import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = (file: string) =>
  readFileSync(new URL(`../src/components/dashboard/admin/${file}`, import.meta.url), "utf8");
const styles = readFileSync(
  new URL("../app/(gestion)/admin-dashboard-mobile.css", import.meta.url),
  "utf8",
);
const upcomingStyles = readFileSync(
  new URL("../src/components/dashboard/admin/admin-upcoming-list.module.css", import.meta.url),
  "utf8",
);

describe("dashboard administración en teléfonos", () => {
  it("carga al final estilos exclusivos del dashboard administrativo", () => {
    const layout = readFileSync(new URL("../app/(gestion)/layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain('import "./admin-dashboard-mobile.css"');
    expect(layout.indexOf('import "./admin-dashboard-mobile.css"')).toBeGreaterThan(
      layout.indexOf('import "./admin-upcoming-refresh.css"'),
    );
    expect(styles).toContain(".admin-dashboard-redesigned .dashboard-content-section");
    expect(styles).toContain("@media (max-width: 360px)");
  });

  it("mantiene navegación y acciones del proveedor activo sin esconderlas en móvil", () => {
    const dashboard = component("admin-dashboard.tsx");
    const today = component("admin-today-timeline.tsx");
    expect(dashboard).toContain('href="/reuniones"');
    expect(dashboard).toContain("Buscar reunión");
    expect(dashboard).not.toContain("/reuniones/buscar-meet");
    expect(dashboard).toContain('href="/monitoreo"');
    expect(dashboard).toContain('href="/reuniones/nueva"');
    expect(today).toContain("href={`/operacion/${meeting.id}`}");
    expect(today).toContain("<CopyMeetLinkButton");
    expect(today).toContain("meeting.joinUrl");
    expect(today).toContain("provider.joinLabel");
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });

  it("distingue encuentro, horario de monitoreo y estado de cohosts", () => {
    const today = component("admin-today-timeline.tsx");
    expect(today).toContain("<MeetingScheduleTimes");
    expect(today).toContain("assistanceStartsAt={meeting.inicioAsistenciaAt}");
    expect(today).toContain("assistanceEndsAt={meeting.finAsistenciaAt}");
    expect(today).toContain("meeting.cohostConfirmado");
    expect(today).toContain("meeting.requiereAsistencia");
  });

  it("usa tarjetas accesibles y lista legible sin tablas desplazables", () => {
    const upcoming = component("admin-upcoming-list.tsx");
    expect(upcoming).toContain('aria-labelledby="admin-upcoming-title"');
    expect(upcoming).toMatch(/<ol\s+className=\{styles(?:\.list|\["list"\])\}>/);
    expect(upcoming).toMatch(/<time\s+className=\{styles(?:\.when|\["when"\])\}/);
    expect(upcoming).toMatch(/styles(?:\.hybrid|\["hybrid"\])/);
    expect(upcomingStyles).toContain("grid-template-columns: 76px minmax(0, 1fr)");
    expect(styles).toContain("button:focus-visible");
    expect(styles).toContain("min-height: 44px");
  });
});
