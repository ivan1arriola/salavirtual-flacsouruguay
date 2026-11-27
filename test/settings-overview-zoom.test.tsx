import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsOverview } from "../src/components/settings-overview";

describe("resumen de configuración", () => {
  it.each([
    ["AUSENTES", "Sin credenciales activas y completas"],
    ["ERROR_COMPROBACION", "No se pudieron comprobar las credenciales"],
  ] as const)("distingue el estado %s", (diagnostico, mensaje) => {
    const html = renderToStaticMarkup(
      <SettingsOverview
        data={{
          zoomAvailableHosts: 1,
          zoomCredentialsAvailable: false,
          zoomCredentialsDiagnostic: diagnostico,
          workspaceReady: true,
          integrationActive: true,
          totalHosts: 1,
          activePrograms: 0,
          totalPrograms: 0,
        }}
      />,
    );
    expect(html).toContain(mensaje);
  });
  it("pide revisar las credenciales si no se pudo confirmar su disponibilidad", () => {
    const html = renderToStaticMarkup(
      <SettingsOverview
        data={{
          zoomAvailableHosts: 1,
          zoomCredentialsAvailable: false,
          workspaceReady: true,
          integrationActive: true,
          totalHosts: 2,
          activePrograms: 0,
          totalPrograms: 0,
        }}
      />,
    );
    expect(html).toContain("No se pudo confirmar la disponibilidad de credenciales");
    expect(html).toContain("Revisar credenciales de Zoom");
    expect(html).not.toContain("Configurar credenciales de Zoom");
  });
  it("separa el estado local de Zoom de las alertas de Google", () => {
    const html = renderToStaticMarkup(
      <SettingsOverview
        data={{
          zoomAvailableHosts: 1,
          zoomCredentialsAvailable: true,
          workspaceReady: false,
          integrationActive: false,
          totalHosts: 2,
          activePrograms: 0,
          totalPrograms: 0,
        }}
      />,
    );
    expect(html).toContain("Configuración local de Zoom disponible");
    expect(html).toContain("La conexión con Zoom no se verificó aquí");
    expect(html).toContain("Google requiere revisión");
    expect(html).not.toContain("Meet");
    expect(html).toContain('href="/configuracion/google"');
    expect(html).not.toContain("Todo está listo para operar");
  });
});
