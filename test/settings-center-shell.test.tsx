import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsCenterShell } from "../src/components/settings-center-shell";
import { SettingsOverview } from "../src/components/settings-overview";

describe("centro de configuración", () => {
  it("en el Resumen no repite el menú de áreas: las tarjetas ya navegan", () => {
    const html = renderToStaticMarkup(
      <SettingsCenterShell activeSection="resumen">contenido</SettingsCenterShell>
    );
    expect(html).not.toContain("Secciones de configuración");
    expect(html).toContain("settings-center__layout--solo");
    expect(html).toContain("contenido");
  });

  it("en las demás áreas muestra el menú lateral y el móvil", () => {
    const html = renderToStaticMarkup(
      <SettingsCenterShell activeSection="salas">contenido</SettingsCenterShell>
    );
    expect(html.match(/Secciones de configuración/g)).toHaveLength(2);
    expect(html).not.toContain("settings-center__layout--solo");
  });

  it("titula los grupos del menú en el lateral y en el móvil", () => {
    const html = renderToStaticMarkup(
      <SettingsCenterShell activeSection="salas">contenido</SettingsCenterShell>
    );
    for (const grupo of ["Integraciones", "Operación", "Comunicación", "Datos"]) {
      expect(html.match(new RegExp(`settings-nav-group">${grupo}<`, "g"))).toHaveLength(2);
    }
  });

  it("el aviso de operaciones pendientes enlaza al bloque del propio Resumen", () => {
    const html = renderToStaticMarkup(
      <SettingsOverview
        data={{
          zoomAvailableHosts: 1,
          zoomCredentialsAvailable: true,
          workspaceReady: true,
          integrationActive: true,
          pendingOperations: 2,
          totalHosts: 2,
          activePrograms: 0,
          totalPrograms: 0
        }}
      />
    );
    expect(html).toContain('href="#operaciones-pendientes"');
    expect(html).toContain("2 operaciones pendientes con Google");
  });

  it("todo aviso del Resumen lleva su ícono: el CSS lo reparte en ícono + texto", () => {
    const html = renderToStaticMarkup(
      <SettingsOverview
        data={{
          zoomAvailableHosts: 1,
          zoomCredentialsAvailable: true,
          workspaceReady: false,
          integrationActive: false,
          pendingOperations: 1,
          totalHosts: 2,
          activePrograms: 0,
          totalPrograms: 0
        }}
      />
    );
    const avisos = html.match(/<section class="settings-attention /g) ?? [];
    const iconos = html.match(/class="settings-attention__icon"/g) ?? [];
    expect(avisos).toHaveLength(2);
    expect(iconos).toHaveLength(avisos.length);
  });
});
