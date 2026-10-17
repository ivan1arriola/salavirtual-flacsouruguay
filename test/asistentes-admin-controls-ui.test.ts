import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("controles administrativos de asistentes de monitoreo", () => {
  it("expone un endpoint administrativo para el estado operativo", () => {
    const path = join(
      process.cwd(),
      "app/api/v1/asistencia/asistentes/[usuarioId]/estado/route.ts"
    );
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;

    const route = readFileSync(path, "utf8");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("actualizarEstadoOperativoAsistente");
    expect(route).toContain('actor.rol !== "ADMINISTRACION"');
  });

  it("permite pausar asignaciones y cesar o reactivar desde el detalle", () => {
    const controls = source(
      "src/modules/asistencia/presentation/components/assistant-admin-controls.tsx"
    );
    const page = source(
      "src/bootstrap/ui/asistencia/asistente-detail-page.server.tsx"
    );

    expect(controls).toContain("Pausar asignaciones");
    expect(controls).toContain("Habilitar asignaciones");
    expect(controls).toContain("Cesar hasta próximo acceso");
    expect(controls).toContain("Reactivar ahora");
    expect(page).toContain("AssistantAdminControls");
    expect(page).toContain("asignacionesFuturas");
  });

  it("agrega búsqueda y filtros de estado al listado administrativo", () => {
    const page = source(
      "src/bootstrap/ui/asistencia/asistentes-page.server.tsx"
    );

    expect(page).toContain('placeholder="Buscar por nombre o correo"');
    expect(page).toContain('<option value="operativos">Operativos</option>');
    expect(page).toContain('<option value="pausados">Pausados</option>');
    expect(page).toContain('<option value="cesados">Cesados</option>');
    expect(page).toContain("assistantStatusLabel");
    expect(page).toContain("Próximas");
  });
});
