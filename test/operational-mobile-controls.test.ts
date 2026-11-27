import { readFileSync } from "node:fs";
import postcss, { type Declaration, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(
  readFileSync(new URL("../app/(gestion)/meeting-detail-v2.css", import.meta.url), "utf8"),
);

function declarationsInMedia(selector: string, maxWidth: number): Map<string, string> {
  let values = new Map<string, string>();
  stylesheet.walkAtRules("media", (media) => {
    if (media.params !== `(max-width: ${maxWidth}px)`) {
      return;
    }
    media.walkRules(selector, (rule) => {
      values = new Map(
        rule.nodes
          .filter((node): node is Declaration => node.type === "decl")
          .map(({ prop, value }) => [prop, value]),
      );
    });
  });
  return values;
}

function declarationsFor(selector: string): Map<string, string> {
  const rule = stylesheet.nodes.find(
    (node): node is Rule => node.type === "rule" && node.selector === selector,
  );
  return new Map(
    rule?.nodes
      .filter((node): node is Declaration => node.type === "decl")
      .map(({ prop, value }) => [prop, value]),
  );
}

describe("controles de la operación de reunión en móvil", () => {
  it("ofrece controles táctiles de 44px para filtrar y editar participantes", () => {
    expect(declarationsInMedia(".operational-tab-btn", 760).get("min-height")).toBe("44px");
    expect(declarationsInMedia(".operational-search-input", 760).get("min-height")).toBe("44px");
    expect(declarationsInMedia(".operational-row-edit-btn", 760).get("min-height")).toBe("44px");
  });

  it("agranda el botón para quitar cohosts y permite leer correos largos en chips", () => {
    expect(declarationsFor(".operational-cohost-chip button").get("min-height")).toBe("32px");
    expect(declarationsInMedia(".operational-cohost-chip button", 760).get("min-height")).toBe(
      "44px",
    );
    expect(declarationsInMedia(".operational-cohost-chip > span", 760).get("overflow-wrap")).toBe(
      "anywhere",
    );
  });
});
