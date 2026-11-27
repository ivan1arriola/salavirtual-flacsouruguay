import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

describe("ruta de nueva reunión", () => {
  it("apunta a la página Zoom", () => {
    expect(leer("app/(gestion)/reuniones/nueva/page.tsx")).toContain(
      "nueva-reunion-zoom-page.server",
    );
  });

  it("la página Zoom no usa cuentas Google ni el formulario de Meet", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/nueva-reunion-zoom-page.server.tsx");
    expect(pagina).not.toContain("cuentasGoogle");
    expect(pagina).not.toContain("teacherEmail");
    expect(pagina).toContain("MeetingFormZoom");
    expect(pagina).not.toContain("MeetingFormV2");
  });

  it("conserva la página de Meet sin ruta", () => {
    expect(
      existsSync(
        new URL("../src/bootstrap/ui/reuniones/nueva-reunion-page.server.tsx", import.meta.url),
      ),
    ).toBe(true);
  });
});
