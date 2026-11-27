import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const disclosure = readFileSync(
  join(process.cwd(), "src/components/profile-menu-disclosure.tsx"),
  "utf8",
);

describe("cierre de los menús de navegación", () => {
  it("cierra al activar un enlace interno, incluso si la URL no cambia", () => {
    expect(disclosure).toContain('target.closest("a[href]")');
    expect(disclosure).toContain("details?.open && link && details.contains(link)");
    expect(disclosure).toContain("closeMenu({ restoreFocus: event.detail === 0 })");
    expect(disclosure).toContain('document.addEventListener("click", handleLinkClick, true)');
    expect(disclosure).toContain('document.removeEventListener("click", handleLinkClick, true)');
  });

  it("conserva el cierre exterior y con Escape", () => {
    expect(disclosure).toContain('document.addEventListener("pointerdown", handlePointerDown)');
    expect(disclosure).toContain('document.addEventListener("keydown", handleKeyDown)');
    expect(disclosure).toContain('document.addEventListener("focusin", handlePointerDown)');
    expect(disclosure).toContain('document.removeEventListener("focusin", handlePointerDown)');
    expect(disclosure).toContain('event.key !== "Escape"');
    expect(disclosure).toContain("closeMenu({ restoreFocus: true })");
  });

  it("admite un control explícito de cierre", () => {
    expect(disclosure).toContain('target.closest("[data-disclosure-close]")');
    expect(disclosure).toContain("details?.open && closeButton && details.contains(closeButton)");
  });
});
