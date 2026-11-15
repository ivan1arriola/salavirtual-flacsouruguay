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
