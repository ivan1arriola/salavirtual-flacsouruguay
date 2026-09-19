import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function filePath(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function source(relativePath: string): string {
  return readFileSync(filePath(relativePath), "utf8");
}

describe("flujo administrativo de desvinculación", () => {
  it("expone un endpoint dedicado y sincroniza integraciones después de cancelar", () => {
    const routePath = filePath("app/api/v1/asistencia/asignaciones/desvincular/route.ts");
    expect(existsSync(routePath)).toBe(true);
    if (!existsSync(routePath)) return;

    const route = readFileSync(routePath, "utf8");
    expect(route).toContain("export async function POST");
    expect(route).toContain("desvincularAsistente");
    expect(route).toContain("sincronizarCohostsDeInstancia");
    expect(route).toContain("sincronizarCalendarioAsistenteInstancia");
  });

  it("ofrece quitar la asignación desde la tabla del asistente", () => {
    const buttonPath = filePath("src/modules/asistencia/presentation/components/assistant-unassign-button.tsx");
    expect(existsSync(buttonPath)).toBe(true);
    if (!existsSync(buttonPath)) return;
    const button = readFileSync(buttonPath, "utf8");
    const table = source("src/modules/asistencia/presentation/components/assistant-meetings-table.tsx");
    expect(button).toContain("Quitar asignación");
    expect(button).toContain('method: "POST"');
    expect(button).toContain("router.refresh()");
    expect(table).toContain("AssistantUnassignButton");
  });

  it("muestra el historial operativo en el detalle administrativo", () => {
    const historyPath = filePath("src/modules/asistencia/presentation/components/assistant-history.tsx");
    expect(existsSync(historyPath)).toBe(true);
    if (!existsSync(historyPath)) return;
    const page = source("src/bootstrap/ui/asistencia/asistente-detail-page.server.tsx");
    const history = readFileSync(historyPath, "utf8");
    expect(page).toContain("obtenerHistorialAsistenteEnRango");
    expect(page).toContain("AssistantHistory");
    expect(history).toContain("Historial de asignaciones");
    expect(history).toContain("DESVINCULADO");
  });
});
