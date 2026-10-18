import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive de agenda con navegación lateral", () => {
  it("apila la barra de filtros antes de que compita con el ancho útil del contenido", () => {
    const stylesheet = readFileSync(
      new URL("../app/(gestion)/agenda-v2.css", import.meta.url),
      "utf8"
    ).replaceAll("\r\n", "\n");

    expect(stylesheet).toContain("@media (max-width: 1400px)");
    expect(stylesheet).toContain(".agenda-toolbar {\n    grid-template-columns: 1fr;");
  });
});
