import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("acciones de notificaciones en movil", () => {
  it("ofrece controles de filtro y acciones de al menos 44px", () => {
    const css = readFileSync(join(process.cwd(), "app/(gestion)/gestion.css"), "utf8");
    const mobileRule = css.match(/@media \(max-width: 560px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(mobileRule).toMatch(/\.notification-filter select\s*\{[^}]*min-height:\s*44px/s);
    expect(mobileRule).toMatch(/\.notification-filter > button\[type="submit"\]\s*\{[^}]*min-height:\s*44px/s);
    expect(mobileRule).toMatch(/\.notification-actions \.icon-button\s*\{[^}]*width:\s*44px/s);
    expect(mobileRule).toMatch(/\.notification-actions \.icon-button\s*\{[^}]*min-height:\s*44px/s);
  });
});
