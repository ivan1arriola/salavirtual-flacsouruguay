import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL(
    "../src/modules/archivos/infrastructure/google/google-artifacts-provider.adapter.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("scope OAuth de la reparación de asistencia", () => {
  it("usa el permiso Sheets delegado para inspeccionar planillas", () => {
    const block = source
      .split("async planillaAsistenciaGoogleVacia(spreadsheetId)")[1]
      ?.split("async obtenerOCrearCarpeta")[0];
    expect(block).toMatch(
      /crearGoogleAuthJwt\(\s*credentials,\s*\[\s*"https:\/\/www\.googleapis\.com\/auth\/spreadsheets"\s*,?\s*\]\s*,?\s*\)/,
    );
    expect(block).not.toContain("spreadsheets.readonly");
  });
});
