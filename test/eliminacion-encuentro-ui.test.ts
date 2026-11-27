import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manager = readFileSync(
  new URL(
    "../src/modules/reuniones/presentation/components/meeting-detail-manager.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("botón de eliminar encuentro del detalle", () => {
  it("decide con el plan de dominio y no deshabilita por solicitud de un solo encuentro", () => {
    expect(manager).toContain("planEliminacionEncuentro");
    expect(manager).not.toContain("encuentrosEnSolicitud <= 1");
  });

  it("para un encuentro único en su solicitud cancela solo esa solicitud, no la serie", () => {
    expect(manager).toContain("solicitudIds: [meeting.solicitudId]");
    expect(manager).not.toMatch(
      /cancelar-serie[\s\S]{0,200}solicitudIds: requestIds[\s\S]{0,40}cancelarSolicitudDelEncuentro/,
    );
  });
});
