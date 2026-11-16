import { readFileSync } from "node:fs";
import postcss, { type Declaration } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(
  readFileSync(new URL("../app/(gestion)/assistant-agenda.css", import.meta.url), "utf8")
);

function declarationsInMobileRule(selector: string): Map<string, string> {
  let values = new Map<string, string>();
  stylesheet.walkAtRules("media", (media) => {
    if (media.params !== "(max-width: 700px)") {
      return;
    }
    media.walkRules(selector, (rule) => {
      values = new Map(
        rule.nodes
          .filter((node): node is Declaration => node.type === "decl")
          .map(({ prop, value }) => [prop, value])
      );
    });
  });
  return values;
}

describe("horarios de monitoreo en Mi agenda móvil", () => {
  it("presenta los horarios juntos y deja la cobertura a todo el ancho", () => {
    expect(declarationsInMobileRule(".assistant-agenda-item").get("grid-template-columns")).toBe(
      "minmax(0, 1fr)"
    );
    expect(
      declarationsInMobileRule(".assistant-agenda-schedule .meeting-schedule-times.is-compact").get(
        "grid-template-columns"
      )
    ).toBe("repeat(2, minmax(0, 1fr))");
  });
});
