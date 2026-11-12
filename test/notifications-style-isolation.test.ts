import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = (relativePath: string) => join(process.cwd(), relativePath);

describe("estilos de notificaciones", () => {
  it("mantiene los estilos de la pantalla fuera de las hojas globales", () => {
    const modulePath = path("app/(gestion)/notificaciones/notificaciones.module.css");
    expect(existsSync(modulePath)).toBe(true);
    if (!existsSync(modulePath)) {
      return;
    }

    const moduleCss = readFileSync(modulePath, "utf8");
    const page = readFileSync(path("app/(gestion)/notificaciones/page.tsx"), "utf8");
    const globalCss = [
      readFileSync(path("app/(gestion)/gestion.css"), "utf8"),
      readFileSync(path("app/(gestion)/brand-refresh.css"), "utf8")
    ].join("\n");

    expect(moduleCss).toContain(".page");
    expect(moduleCss).toContain(".actionWrap");
    expect(moduleCss).toContain("min-height: 44px");
    expect(page).toContain("className={styles.page}");
    expect(page).toContain("className={styles.actionWrap}");
    expect(globalCss).not.toContain(".notification-filter");
    expect(globalCss).not.toContain(".notification-item");
    expect(globalCss).not.toContain(".notification-actions");
  });
});
