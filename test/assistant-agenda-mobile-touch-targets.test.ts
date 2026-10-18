import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("objetivos táctiles de Mi agenda en móvil", () => {
  it("mantiene en 44px las acciones de monitoreo y Meet", () => {
    const css = readFileSync(join(process.cwd(), "app/(gestion)/assistant-agenda.css"), "utf8");
    const mobileRules = css.match(/@media \(max-width: 560px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(mobileRules).toContain(".assistant-self-unassign-button");
    expect(mobileRules).toMatch(/\.assistant-agenda-primary-actions > \.secondary-action\s*\{[^}]*min-height:\s*44px/s);
    expect(mobileRules).toMatch(/\.assistant-self-unassign-button\s*\{[^}]*min-height:\s*44px/s);
    expect(mobileRules).toMatch(/\.assistant-agenda-open-meet\s*\{[^}]*min-height:\s*44px/s);
    expect(mobileRules).toMatch(/\.assistant-agenda-link-actions \.assistant-agenda-open-meet,\s*\.assistant-agenda-link-actions \.copy-meet-button\s*\{[^}]*min-height:\s*44px/s);
  });
});
