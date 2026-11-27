import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CohostSuggestions } from "../src/modules/reuniones/presentation/components/cohost-suggestions";

describe("sugerencias de cohosts", () => {
  it("presenta cada sugerencia como botón nativo en una lista identificada", () => {
    const html = renderToStaticMarkup(
      createElement(CohostSuggestions, {
        options: [{ email: "ana@example.com", name: "Ana", source: "Programa" }],
        onSelect: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Sugerencias de cohosts"');
    expect(html).toContain("<ul");
    expect(html).toContain('<button type="button"');
    expect(html).toContain("ana@example.com");
    expect(html).not.toContain('role="option"');
    expect(html).not.toContain('role="listbox"');
  });
});
