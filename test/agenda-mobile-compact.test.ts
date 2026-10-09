import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("agenda de reuniones en móvil", () => {
  const page = source("app/(gestion)/reuniones/page.tsx");
  const styles = source("app/(gestion)/agenda-mobile-compact.css");

  it("conserva búsqueda directa y acceso a filtros avanzados con valores persistentes", () => {
    expect(page).toContain('className="agenda-query-field"');
    expect(page).toContain('className="secondary-action agenda-mobile-search-submit"');
    expect(page).toContain('id="agenda-advanced-toggle"');
    expect(page).toContain("defaultChecked={Boolean(programaId || desdeParam || hastaParam)}");
    expect(page).toContain('className="agenda-advanced-fields"');
    expect(styles).toContain(".agenda-advanced-checkbox:checked ~ .agenda-advanced-fields");
    expect(page).toContain('name="desde"');
    expect(page).toContain('name="hasta"');
  });

  it("expone un resumen operativo y detalles desplegables en ambas vistas", () => {
    expect(page.match(/className="agenda-mobile-glance"/g)).toHaveLength(2);
    expect(page.match(/className="agenda-mobile-details-control"/g)).toHaveLength(2);
    expect(page).toContain('id={`agenda-details-${request.id}`}');
    expect(page).toContain('id={`agenda-details-${meeting.id}`}');
    expect(styles).toContain(":has(.agenda-mobile-details-input:checked)");
    expect(page).toContain('className="agenda-access-panel"');
    expect(page).toContain('className="agenda-meeting-card-footer"');
  });

  it("mantiene acciones de Meet y navegación a detalles al compactar la vista", () => {
    expect(page).toContain("<MeetLinkActions");
    expect(page).toContain("AdminRetryMeetAction");
    expect(page).toContain("Ver serie");
    expect(page).toContain("Ver detalle");
    expect(source("app/(gestion)/layout.tsx")).toContain('import "./agenda-mobile-compact.css";');
  });
});
