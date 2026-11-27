import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tokens = readFileSync(resolve(root, "app/brand.css"), "utf8");
const baseStyles = readFileSync(resolve(root, "app/(gestion)/gestion.css"), "utf8");
const refreshedStyles = readFileSync(resolve(root, "app/(gestion)/brand-refresh.css"), "utf8");

describe("tokens semánticos de estados", () => {
  it.each([
    "success-foreground",
    "success-background",
    "success-border",
    "warning-foreground",
    "warning-background",
    "warning-border",
    "danger-foreground",
    "danger-background",
    "danger-border",
    "neutral-foreground",
    "neutral-background",
    "neutral-border",
  ])("define el token state-%s", (name) => {
    expect(tokens).toContain(`--state-${name}:`);
  });

  it("usa los mismos tokens semánticos para los estados compartidos", () => {
    expect(baseStyles).toMatch(/\.status-ok\s*\{[^}]*color:\s*var\(--state-success-foreground\)/s);
    expect(baseStyles).toMatch(
      /\.status-warning\s*\{[^}]*color:\s*var\(--state-warning-foreground\)/s,
    );
    expect(baseStyles).toMatch(
      /\.status-error\s*\{[^}]*color:\s*var\(--state-danger-foreground\)/s,
    );
    expect(refreshedStyles).toMatch(
      /\.status-ok\s*\{[^}]*border-color:\s*var\(--state-success-border\);[^}]*background:\s*var\(--state-success-background\)/s,
    );
    expect(refreshedStyles).toMatch(
      /\.status-warning\s*\{[^}]*border-color:\s*var\(--state-warning-border\);[^}]*background:\s*var\(--state-warning-background\)/s,
    );
    expect(refreshedStyles).toMatch(
      /\.status-error\s*\{[^}]*border-color:\s*var\(--state-danger-border\);[^}]*background:\s*var\(--state-danger-background\)/s,
    );
    expect(refreshedStyles).toMatch(
      /\.status-neutral\s*\{[^}]*border-color:\s*var\(--state-neutral-border\);[^}]*background:\s*var\(--state-neutral-background\)/s,
    );
  });
});
