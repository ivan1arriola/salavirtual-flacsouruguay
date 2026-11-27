import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Agenda abierta en movil", () => {
  it("usa una columna fluida y un boton de postulacion de 44px", () => {
    const css = readFileSync(join(process.cwd(), "app/(gestion)/assistant-agenda.css"), "utf8");
    const mobileRule =
      [...css.matchAll(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/g)]
        .map(([rule]) => rule)
        .find((rule) => rule.includes(".open-agenda-card-grid")) ?? "";

    expect(mobileRule).toMatch(
      /\.open-agenda-card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(mobileRule).toMatch(
      /\.open-agenda-card-actions\s+\.row-action\s*>\s*button\s*\{[^}]*min-height:\s*44px/s,
    );
    expect(mobileRule).toMatch(
      /\.open-agenda-card-actions\s+\.row-action\s*>\s*button\s*\{[^}]*width:\s*100%/s,
    );
  });
});
