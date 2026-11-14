import { describe, expect, it } from "vitest";
import {
  SETTINGS_SECTIONS,
  resolveSettingsSection,
  settingsNeedsAttention,
  settingsHref,
  legacySettingsRedirect,
  workspaceReadiness
} from "../src/modules/configuracion/settings-navigation.domain";

describe("navegación de configuración", () => {
  it("abre el resumen ante una sección ausente o desconocida", () => {
    expect(resolveSettingsSection()).toBe("resumen");
    expect(resolveSettingsSection("otra")).toBe("resumen");
  });

  it("conserva las secciones públicas y sus enlaces", () => {
    expect(resolveSettingsSection("workspace")).toBe("workspace");
    expect(resolveSettingsSection("historico")).toBe("historico");
    expect(settingsHref("resumen")).toBe("/configuracion");
    expect(settingsHref("programas")).toBe("/usuarios?vista=programas");
    expect(legacySettingsRedirect("programas")).toBe("/usuarios?vista=programas");
    expect(legacySettingsRedirect("correo")).toBeNull();
    expect(SETTINGS_SECTIONS.find(({ id }) => id === "historico")?.label).toBe("Registros Zoom importados");
  });

  it("expone todas las secciones en el orden de trabajo", () => {
    expect(SETTINGS_SECTIONS.map(({ id }) => id)).toEqual([
      "resumen",
      "workspace",
      "zoom",
      "salas",
      "asistencia",
      "correo",
      "historico"
    ]);
  });

  it("resume los cuatro requisitos visibles de Google Workspace", () => {
    expect(
      workspaceReadiness({
        serviceAccountEmail: "service@example.com",
        privateKeyConfigurada: true,
        serviceAccountSubject: "sala@example.com",
        driveDestinationId: "folder",
        activa: true
      })
    ).toEqual({ readyCount: 4, totalCount: 4, ready: true });

    expect(
      workspaceReadiness({
        serviceAccountEmail: "service@example.com",
        privateKeyConfigurada: false,
        serviceAccountSubject: "",
        driveDestinationId: null,
        activa: false
      })
    ).toEqual({ readyCount: 0, totalCount: 4, ready: false });
  });

  it("evalúa Zoom separadamente de Google Workspace", () => {
    expect(
      settingsNeedsAttention({
        zoomAvailableHosts: 1,
        zoomCredentialsAvailable: true
      })
    ).toBe(false);
    expect(settingsNeedsAttention({ zoomAvailableHosts: 0, zoomCredentialsAvailable: true })).toBe(true);
    expect(settingsNeedsAttention({ zoomAvailableHosts: 1, zoomCredentialsAvailable: false })).toBe(true);
  });
});
