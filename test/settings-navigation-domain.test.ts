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

  it("resuelve las secciones públicas y arma sus enlaces por ruta", () => {
    expect(resolveSettingsSection("google")).toBe("google");
    expect(resolveSettingsSection("historico")).toBe("historico");
    expect(resolveSettingsSection("workspace")).toBe("resumen");
    expect(settingsHref("resumen")).toBe("/configuracion");
    expect(settingsHref("google")).toBe("/configuracion/google");
    expect(settingsHref("historico")).toBe("/configuracion/historico");
    expect(SETTINGS_SECTIONS.find(({ id }) => id === "historico")?.label).toBe("Registros Zoom importados");
  });

  it("redirige los enlaces antiguos ?seccion= a su ruta nueva", () => {
    expect(legacySettingsRedirect("workspace")).toBe("/configuracion/google");
    expect(legacySettingsRedirect("asistencia")).toBe("/configuracion/notificaciones");
    expect(legacySettingsRedirect("zoom")).toBe("/configuracion/zoom");
    expect(legacySettingsRedirect("salas")).toBe("/configuracion/salas");
    expect(legacySettingsRedirect("correo")).toBe("/configuracion/correo");
    expect(legacySettingsRedirect("programas")).toBe("/usuarios?vista=programas");
    expect(legacySettingsRedirect("historico")).toBe("/configuracion/historico");
    expect(legacySettingsRedirect("historico", { busqueda: "ana", pagina: "2" })).toBe(
      "/configuracion/historico?busqueda=ana&pagina=2"
    );
    expect(legacySettingsRedirect("otra")).toBeNull();
    for (const heredada of ["constructor", "toString", "__proto__"]) {
      expect(legacySettingsRedirect(heredada)).toBeNull();
    }
    expect(legacySettingsRedirect()).toBeNull();
  });

  it("expone en el menú las áreas en orden y sin el histórico", () => {
    const menu = SETTINGS_SECTIONS.filter(({ hidden }) => !hidden);
    expect(menu.map(({ id }) => id)).toEqual([
      "resumen",
      "zoom",
      "google",
      "salas",
      "correo",
      "notificaciones"
    ]);
    expect(SETTINGS_SECTIONS.map(({ id }) => id)).toEqual([...menu.map(({ id }) => id), "historico"]);
  });

  it("agrupa las secciones por tipo de tarea y deja el resumen sin grupo", () => {
    expect(SETTINGS_SECTIONS.map(({ id, group }) => [id, group])).toEqual([
      ["resumen", undefined],
      ["zoom", "Integraciones"],
      ["google", "Integraciones"],
      ["salas", "Operación"],
      ["correo", "Comunicación"],
      ["notificaciones", "Comunicación"],
      ["historico", undefined]
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
