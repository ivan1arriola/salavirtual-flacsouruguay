import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const parent = readFileSync(new URL("../src/modules/reuniones/presentation/components/meeting-form-v2.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/modules/reuniones/presentation/components/email-list-editor.tsx", import.meta.url), "utf8");

describe("contrato de accesibilidad del formulario", () => {
  it("bloquea la creación hasta validar datos académicos y fechas", () => {
    expect(parent).toContain('disabled={!isReady || status === "saving" || status === "done"}');
    expect(parent).toContain('aria-busy={status === "saving"}');
    expect(parent).toContain('role="alert"');
  });

  it("el editor separado anuncia errores y expone controles identificables", () => {
    expect(parent).toContain('import { EmailListEditor } from "./email-list-editor"');
    expect(editor).toContain('aria-invalid={Boolean(error)}');
    expect(editor).toContain('aria-describedby={error ? errorId : undefined}');
    expect(editor).toContain('role={error ? "alert" : "status"}');
    expect(editor).toContain('aria-label={`Quitar ${email}`}');
  });
});
