import { readFileSync } from "node:fs";
import postcss, { type Declaration } from "postcss";
import { describe, expect, it } from "vitest";

const stylesUrl = new URL("../app/(gestion)/ux-polish.css", import.meta.url);
const styles = postcss.parse(readFileSync(stylesUrl, "utf8"));
const shell = readFileSync(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
const navigationUrl = new URL("../app/(gestion)/profile-navigation-refresh.css", import.meta.url);
const navigation = readFileSync(navigationUrl, "utf8");

function declarations(selector: string) {
  const values = new Map<string, string>();
  styles.walkRules(selector, (rule) => {
    for (const { prop, value } of rule.nodes.filter(
      (node): node is Declaration => node.type === "decl",
    )) {
      values.set(prop, value);
    }
  });
  return values;
}

describe("navegación móvil secundaria", () => {
  it("mantiene una lista legible con objetivos táctiles de 48px", () => {
    expect(declarations(".mobile-more-menu nav").get("grid-template-columns")).toBe(
      "minmax(0, 1fr)",
    );
    expect(declarations(".mobile-more-menu nav a").get("min-height")).toBe("48px");
    expect(declarations(".mobile-more-menu nav a").get("text-align")).toBe("left");
    expect(declarations(".mobile-more-menu nav a > span").get("white-space")).toBe("normal");
  });

  it("limita la altura al viewport y mantiene visible el encabezado", () => {
    expect(declarations(".mobile-more-menu").get("max-height")).toContain("100dvh");
    expect(declarations(".mobile-more-menu").get("overflow-y")).toBe("auto");
    expect(declarations(".mobile-more-heading").get("position")).toBe("sticky");
    expect(declarations(".mobile-more-close").get("min-height")).toBe("44px");
    expect(shell).toContain('aria-label="Cerrar menú de navegación"');
  });

  it("indica la página actual con más que color y conserva el foco visible", () => {
    expect(shell).toContain('className="mobile-more-current"');
    const current = declarations(
      '.mobile-more-menu nav a[aria-current="page"] .mobile-more-current',
    );
    expect(current.get("visibility")).toBe("visible");
    expect(declarations(".mobile-more-menu :is(a, button):focus-visible").get("outline")).toContain(
      "2px",
    );
    expect(navigation).toContain(
      '.mobile-nav-more:has(a[aria-current="page"]):not([open]) > summary',
    );
  });
});
