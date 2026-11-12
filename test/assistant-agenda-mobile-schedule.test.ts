import { readFileSync } from "node:fs";
import postcss, { type Declaration } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(
  readFileSync(new URL("../app/(gestion)/assistant-agenda.css", import.meta.url), "utf8")
);

function declarationsInMobileRule(selector: string): Map<string, string> {
  let values = new Map<string, string>();
  stylesheet.walkAtRules("media", (media) => {
    if (media.params !== "(max-width: 560px)") {
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
  it("apila los horarios a todo el ancho debajo de la fecha en teléfonos", () => {
    expect(declarationsInMobileRule(".assistant-agenda-date-block").get("display")).toBe("grid");
    expect(
      declarationsInMobileRule(".assistant-agenda-date-block > .meeting-schedule-times").get("grid-column")
    ).toBe("1 / -1");
    expect(
      declarationsInMobileRule(".assistant-agenda-date-block > .meeting-schedule-times").get("width")
    ).toBe("100%");
  });
});
