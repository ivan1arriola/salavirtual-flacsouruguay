import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/(gestion)/usuarios/page.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../app/(gestion)/settings.css", import.meta.url), "utf8");

describe("vista móvil del directorio de personas", () => {
  it("mantiene encabezados semánticos y muestra el contexto de cada dato en las tarjetas móviles", () => {
    expect(page).toContain('<table className="data-table user-directory-table">');
    expect(page).toContain('<caption className="sr-only">{selected.title} de Sala Virtual FLACSO</caption>');
    expect(page).toContain('<th scope="col">Cuentas Google</th>');
    expect(page).toContain('data-label="Persona"');
    expect(page).toContain('data-label="Cuentas Google"');
    expect(page).toContain('data-label="Acceso"');
    expect(page).toContain('data-label="Acción"');
  });

  it("presenta las etiquetas dentro de las tarjetas en el breakpoint móvil existente", () => {
    expect(stylesheet).toContain("@media (max-width: 640px)");
    expect(stylesheet).toContain(".user-directory-table td::before");
    expect(stylesheet).toContain("content: attr(data-label)");
  });
});
