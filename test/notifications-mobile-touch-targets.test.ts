import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("acciones de notificaciones en movil", () => {
  it("ofrece controles de filtro y acciones de al menos 44px", () => {
    const css = readFileSync(join(process.cwd(), "app/(gestion)/notificaciones/notificaciones.module.css"), "utf8");

    expect(css).toMatch(/\.page \.filter select,\s*\.page \.filter > button\[type="submit"\]\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.page \.actions \.actionWrap :global\(\.icon-button\)\s*\{[^}]*width:\s*44px/s);
    expect(css).toMatch(/\.page \.actions \.actionWrap :global\(\.icon-button\)\s*\{[^}]*min-height:\s*44px/s);
  });
});
