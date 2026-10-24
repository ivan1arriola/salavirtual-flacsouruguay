import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("../src/components/dashboard/admin/live-participants-indicator.tsx", import.meta.url);
const timelineUrl = new URL("../src/components/dashboard/admin/admin-today-timeline.tsx", import.meta.url);
const routeUrl = new URL(
  "../app/api/v1/reuniones/instancias/[instanciaId]/participantes-activos/route.ts",
  import.meta.url
);

describe("participantes activos de Google Meet", () => {
  it("expone un endpoint autenticado y limita la consulta al rol de administración", () => {
    expect(existsSync(routeUrl)).toBe(true);

    const source = readFileSync(routeUrl, "utf8");
    expect(source).toContain("await auth()");
    expect(source).toContain('actor.rol !== "ADMINISTRACION"');
    expect(source).toContain("obtenerParticipantesActivosInstancia");
  });

  it("actualiza automáticamente el indicador mientras la reunión está en vivo", () => {
    expect(existsSync(componentUrl)).toBe(true);

    const source = readFileSync(componentUrl, "utf8");
    const timelineSource = readFileSync(timelineUrl, "utf8");
    expect(source).toContain('"use client"');
    expect(source).toContain("setInterval");
    expect(source).toContain("15_000");
    expect(source).toContain("participantes-activos");
    expect(source).toContain("conectados");
    expect(timelineSource).toContain("LiveParticipantsIndicator");
    expect(timelineSource).toContain("isLive ? <LiveParticipantsIndicator");
  });
});
