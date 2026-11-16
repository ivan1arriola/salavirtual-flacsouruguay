import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

describe("objetivos táctiles de Mi agenda en móvil", () => {
  it("mantiene en 44px las acciones primarias y secundarias de cada cobertura", () => {
    const css = readFileSync(new URL("../app/(gestion)/assistant-agenda.css", import.meta.url), "utf8");
    const selectors = new Set<string>();
    postcss.parse(css).walkAtRules("media", (media) => {
      if (media.params !== "(max-width: 700px)") {
        return;
      }
      media.walkRules((rule) => {
        const hasTouchTarget = rule.nodes.some(
          (node) => node.type === "decl" && node.prop === "min-height" && node.value === "44px"
        );
        if (hasTouchTarget) {
          rule.selectors.forEach((selector) => selectors.add(selector));
        }
      });
    });

    expect([...selectors]).toEqual(
      expect.arrayContaining([
        ".assistant-agenda-action .secondary-action",
        ".assistant-agenda-open-meeting",
        ".assistant-agenda-link-actions .copy-meet-button",
        ".assistant-agenda-more > summary",
        ".assistant-agenda-action .assistant-self-unassign-button"
      ])
    );
  });
});
