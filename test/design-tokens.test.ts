import { readFileSync } from "node:fs";
import postcss, { type Declaration, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(
  readFileSync(new URL("../app/brand.css", import.meta.url), "utf8"),
);

function declarationsFor(selector: string): Map<string, string> {
  const rule = stylesheet.nodes.find(
    (node): node is Rule => node.type === "rule" && node.selector === selector,
  );
  if (!rule) {
    return new Map();
  }

  return new Map(
    rule.nodes
      .filter((node): node is Declaration => node.type === "decl")
      .map(({ prop, value }) => [prop, value]),
  );
}

const rootDeclarations = declarationsFor(":root");

function resolveToken(name: string, visited = new Set<string>()): string | undefined {
  if (visited.has(name)) {
    return undefined;
  }
  visited.add(name);

  const value = rootDeclarations.get(name);
  const reference = value?.match(/^var\((--[\w-]+)\)$/);
  return reference ? resolveToken(reference[1], visited) : value;
}

describe("design token stylesheet contract", () => {
  it("preserves the institutional brand and resolves semantic state aliases", () => {
    expect(rootDeclarations.get("--brand")).toBe("#2c4777");
    expect(resolveToken("--state-success")).toBe("#24745b");
    expect(resolveToken("--state-warning")).toBe("#a96f00");
    expect(resolveToken("--state-danger")).toBe("#a94242");
    expect(resolveToken("--state-info")).toBe("#2c4777");
  });

  it("provides a shared font family and a documented type scale", () => {
    expect(rootDeclarations.get("--font-sans")).toBe(
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    );
    expect(declarationsFor("body").get("font-family")).toBe("var(--font-sans)");

    for (const [token, value] of [
      ["--text-xs", "0.75rem"],
      ["--text-sm", "0.875rem"],
      ["--text-md", "1rem"],
      ["--text-lg", "1.125rem"],
      ["--text-xl", "1.25rem"],
      ["--text-2xl", "1.5rem"],
      ["--text-3xl", "1.875rem"],
    ]) {
      expect(rootDeclarations.get(token)).toBe(value);
    }
  });

  it("provides the spacing, radius, and border scales", () => {
    for (const [token, value] of [
      ["--space-1", "0.25rem"],
      ["--space-2", "0.5rem"],
      ["--space-3", "0.75rem"],
      ["--space-4", "1rem"],
      ["--space-5", "1.25rem"],
      ["--space-6", "1.5rem"],
      ["--space-8", "2rem"],
      ["--radius-sm", "4px"],
      ["--radius-md", "6px"],
      ["--radius-lg", "8px"],
      ["--radius-full", "9999px"],
      ["--border-width", "1px"],
    ]) {
      expect(rootDeclarations.get(token)).toBe(value);
    }
  });

  it("uses a solid institutional focus ring on keyboard focus", () => {
    expect(rootDeclarations.get("--focus-ring-color")).toBe("#2c4777");

    const focusRules = stylesheet.nodes.filter(
      (node): node is Rule => node.type === "rule" && node.selector.includes(":focus-visible"),
    );
    const hasTokenizedFocusOutline = focusRules.some((rule) => {
      const declarations = new Map(
        rule.nodes
          .filter((node): node is Declaration => node.type === "decl")
          .map(({ prop, value }) => [prop, value]),
      );
      return (
        declarations.get("outline") === "3px solid var(--focus-ring-color)" &&
        declarations.get("outline-offset") === "2px"
      );
    });

    expect(hasTokenizedFocusOutline).toBe(true);
  });
});
