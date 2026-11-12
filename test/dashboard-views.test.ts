import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  determinarEstadoTemporal,
  esMismoDiaMontevideo,
  formatearTiempoHastaReunion
} from "../src/modules/dashboard/dashboard.domain";

describe("integración de vistas de dashboard", () => {
  it("mantiene / como dashboard principal y despacha por rol", () => {
    const source = readFileSync(join(process.cwd(), "app/(gestion)/page.tsx"), "utf8");

    expect(source).toContain('if (session.user.role === "ASISTENTE_TECNICO")');
    expect(source).toContain("<AssistantDashboard");
    expect(source).toContain('if (session.user.role === "DOCENTE")');
    expect(source).toContain("<TeacherDashboard");
    expect(source).toContain("<AdminDashboard");
    expect(source).not.toContain('redirect("/reuniones")');
    expect(source).not.toContain('redirect("/operacion');
  });
  const baseDate = new Date("2026-09-11T18:00:00-03:00");

  it("garantiza que reuniones con inicio a futuro el mismo día se identifiquen para timeline", () => {
    const inicio = new Date("2026-09-11T20:00:00-03:00");
    const fin = new Date("2026-09-11T22:00:00-03:00");

    expect(esMismoDiaMontevideo(inicio, baseDate)).toBe(true);
    expect(determinarEstadoTemporal(inicio, fin, baseDate)).toBe("PROXIMA_HOY");
    expect(formatearTiempoHastaReunion(inicio, baseDate)).toBe("Empieza en 2 h");
  });

  it("garantiza que clases en curso se identifiquen como EN_VIVO para el Hero docente", () => {
    const inicio = new Date("2026-09-11T17:55:00-03:00");
    const fin = new Date("2026-09-11T19:30:00-03:00");

    expect(determinarEstadoTemporal(inicio, fin, baseDate)).toBe("EN_VIVO");
    expect(formatearTiempoHastaReunion(inicio, baseDate)).toBe("En curso");
  });

  it("presenta acciones y estados según el proveedor activo", () => {
    const adapter = readFileSync(
      join(process.cwd(), "src/modules/dashboard/admin-dashboard.adapter.ts"),
      "utf8"
    );
    const dashboard = readFileSync(
      join(process.cwd(), "src/components/dashboard/admin/admin-dashboard.tsx"),
      "utf8"
    );
    const timeline = readFileSync(
      join(process.cwd(), "src/components/dashboard/admin/admin-today-timeline.tsx"),
      "utf8"
    );

    expect(adapter).toContain("readonly proveedorTipo: string | null");
    expect(adapter).toContain("proveedorTipo: meet?.proveedor.tipo ?? null");
    expect(dashboard).toContain('href="/reuniones"');
    expect(dashboard).toContain("Buscar reunión");
    expect(dashboard).not.toContain("/reuniones/buscar-meet");
    expect(timeline).toContain("getMeetingProviderPresentation(meeting.proveedorTipo)");
    expect(timeline).toContain("provider.supportsCohosts");
    expect(timeline).toContain("isLive && provider.supportsCohosts");
    expect(timeline).toContain("provider.joinLabel");
  });
});
