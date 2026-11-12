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
    if (!existsSync(routePath)) {
      return;
    }

    const route = readFileSync(routePath, "utf8");
    expect(route).toContain("export async function POST");
    expect(route).toContain("desvincularAsistente");
    expect(route).toContain("sincronizarAsignacionAsistente");
  });

  it("ofrece quitar la asignación desde la tabla del asistente", () => {
    const buttonPath = filePath(
      "src/modules/asistencia/presentation/components/assistant-unassign-button.tsx"
    );
    expect(existsSync(buttonPath)).toBe(true);
    if (!existsSync(buttonPath)) {
      return;
    }
    const button = readFileSync(buttonPath, "utf8");
    const table = source("src/modules/asistencia/presentation/components/assistant-meetings-table.tsx");
    expect(button).toContain("Quitar asignación");
    expect(button).toContain('method: "POST"');
    expect(button).toContain("router.refresh()");
    expect(table).toContain("AssistantUnassignButton");
  });

  it("separa la gestión de la tarjeta y conserva la acción de desasignación sin cancelar el monitoreo", () => {
    const actions = source("src/modules/asistencia/presentation/components/coverage-assistance-actions.tsx");
    const page = source("src/bootstrap/ui/asistencia/asistencia-tecnica-page.server.tsx");
    const css = source("app/(gestion)/operations.css");

    const detail = source("app/(gestion)/monitoreo/gestionar/[instanciaId]/page.tsx");
    expect(page).toContain("/monitoreo/gestionar/${meeting.id}");
    expect(page).not.toContain("coverage-management-disclosure");
    expect(detail).toContain("GestionCoberturaPanel");
    expect(actions).toContain('className="secondary-action coverage-unassign-action"');
    expect(actions).toContain("Desasignar asistente");
    expect(actions).toContain('fetch("/api/v1/asistencia/asignaciones/desvincular"');
    expect(actions).toContain("JSON.stringify({ asignacionId: assignmentId })");
    expect(actions).toContain("El monitoreo continúa pendiente de cobertura.");
    expect(actions).toContain("covered && assignmentId");
    expect(actions).toContain("!covered");
    expect(actions).toContain("requiereAsistenciaTecnica: false"); // Solo en la acción separada de cancelar monitoreo.
    expect(css).toContain(".coverage-unassign-action");
    expect(css).toContain(".coverage-management-actions .coverage-unassign-action");
  });

  it("notifica la baja administrativa y expone errores de sincronización", () => {
    const route = source("app/api/v1/asistencia/asignaciones/desvincular/route.ts");
    expect(route).toContain('actor.rol === "ADMINISTRACION"');
    expect(route).toMatch(/await notificarUsuario\(\s*db,/);
    expect(route).toContain('titulo: "Monitoreo desasignado"');
    expect(route).toContain("const warning = warnings.join");
    expect(route).toContain("status: warning ? 202 : 200");
  });

  it("permite darse de baja desde Mi agenda antes de comenzar el monitoreo", () => {
    const buttonPath = filePath(
      "src/modules/asistencia/presentation/components/assistant-self-unassign-button.tsx"
    );
    expect(existsSync(buttonPath)).toBe(true);
    if (!existsSync(buttonPath)) {
      return;
    }

    const button = readFileSync(buttonPath, "utf8");
    const agenda = source("src/bootstrap/ui/asistencia/mi-agenda-page.server.tsx");
    expect(button).toContain("Darme de baja");
    expect(button).toContain("/api/v1/asistencia/asignaciones/desvincular");
    expect(agenda).toContain("AssistantSelfUnassignButton");
    expect(agenda).toContain("inicioAsistencia.getTime() > ahora.getTime()");
  });

  it("muestra la baja voluntaria también desde la consola operativa", () => {
    const operationPage = source("src/bootstrap/ui/reuniones/reunion-operativa-page.server.tsx");
    expect(operationPage).toContain("AssistantSelfUnassignButton");
    expect(operationPage).toContain("canSelfUnassign");
    expect(operationPage).toContain("reunion.asistencia.inicioAt.getTime()");
    expect(operationPage).toContain('className="meeting-detail-v2 operational-console"');
  });

  it("muestra el historial operativo en el detalle administrativo", () => {
    const historyPath = filePath("src/modules/asistencia/presentation/components/assistant-history.tsx");
    expect(existsSync(historyPath)).toBe(true);
    if (!existsSync(historyPath)) {
      return;
    }
    const page = source("src/bootstrap/ui/asistencia/asistente-detail-page.server.tsx");
    const history = readFileSync(historyPath, "utf8");
    expect(page).toContain("obtenerHistorialAsistenteEnRango");
    expect(page).toContain("AssistantHistory");
    expect(history).toContain("Historial de asignaciones");
    expect(history).toContain("DESVINCULADO");
  });
});
