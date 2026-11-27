import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const archivos = [
  "src/modules/archivos/domain/asistencia-zoom.domain.ts",
  "src/modules/archivos/ports/asistencia-zoom.port.ts",
  "src/modules/archivos/infrastructure/prisma/prisma-asistencia-zoom-repository.adapter.ts",
  "src/modules/archivos/infrastructure/zoom/zoom-asistencia-provider.adapter.ts",
];

describe("la asistencia de Zoom no toca la de Meet", () => {
  it.each(archivos)("%s no menciona RegistroAsistenciaMeet", (ruta) => {
    expect(readFileSync(ruta, "utf8")).not.toMatch(/registroAsistenciaMeet|RegistroAsistenciaMeet/);
  });

  it("la migración nueva solo crea objetos y no altera tablas existentes", () => {
    const sql = readFileSync(
      "prisma/migrations/20261109000000_zoom_asistencia/migration.sql",
      "utf8",
    );
    expect(sql).not.toMatch(/DROP\s/);
    expect(sql).not.toMatch(/ALTER TABLE "(?!SesionAsistenciaZoom|RegistroAsistenciaZoom)/);
    expect(sql).not.toMatch(/RegistroAsistenciaMeet/);
  });
});
