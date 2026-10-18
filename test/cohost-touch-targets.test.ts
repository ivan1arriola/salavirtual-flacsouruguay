import { readFileSync } from "node:fs";
import postcss, { type Declaration, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(readFileSync(new URL("../app/(gestion)/operations.css", import.meta.url), "utf8"));

describe("selector de cohosts en móvil", () => {
  it("proporciona un área pulsable de 44px por persona en el formulario de reunión", () => {
    let row: Rule | undefined;
    stylesheet.walkAtRules("media", (media) => {
      if (media.params !== "(max-width: 760px)") return;
      media.walkRules(".cohost-disclosure .checkbox-list label", (candidate) => {
        row = candidate as Rule;
      });
    });
    const declarations = new Map(
      row?.nodes
        .filter((node): node is Declaration => node.type === "decl")
        .map(({ prop, value }) => [prop, value])
    );

    expect(declarations.get("min-height")).toBe("44px");
    expect(declarations.get("padding-block")).toBe("8px");
  });
});