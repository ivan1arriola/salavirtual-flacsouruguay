import { describe, expect, it } from "vitest";
import { getNavigationForRole, isNavigationItemActive } from "@/src/components/app-navigation";

describe("role based application navigation", () => {
  it("groups administration around daily work, resources, and system tasks", () => {
    const navigation = getNavigationForRole("ADMINISTRACION");

    expect(navigation.groups.map(({ label }) => label)).toEqual([
      "Trabajo diario",
      "Equipo de monitoreo",
      "Recursos",
      "Sistema"
    ]);
    expect(navigation.groups.flatMap(({ items }) => items.map(({ label }) => label))).toEqual([
      "Inicio",
      "Agenda",
      "Reuniones",
      "Monitoreo",
      "Nueva reunión",
      "Asistentes de monitoreo",
      "Grabaciones y archivos",
      "Personas y programas",
      "Centro de operaciones",
      "Configuración"
    ]);
    expect(navigation.groups.find(({ label }) => label === "Recursos")?.items.map(({ label }) => label)).toEqual([
      "Grabaciones y archivos",
      "Personas y programas"
    ]);
    expect(navigation.mobilePrimary.map(({ label }) => label)).toEqual([
      "Inicio",
      "Agenda",
      "Reuniones",
      "Monitoreo"
    ]);
    expect(navigation.groups.flatMap(({ items }) => items).map(({ href }) => href))
      .not.toContain("/reuniones/buscar-meet");
    expect(navigation.groups.flatMap(({ items }) => items).map(({ href }) => href))
      .not.toContain("/reuniones/duplicados");
  });

  it("exposes the complete teacher workflow through the main and more menus", () => {
    const navigation = getNavigationForRole("DOCENTE");
    const labels = navigation.groups.flatMap(({ items }) => items.map(({ label }) => label));

    expect(labels).toEqual([
      "Inicio",
      "Mi agenda",
      "Nueva reunión",
      "Mis programas",
      "Grabaciones",
      "Notificaciones",
      "Mi perfil"
    ]);
    expect(navigation.mobilePrimary).toHaveLength(4);
  });

  it("exposes the complete monitoring assistant workflow with distinct agenda and assigned work", () => {
    const navigation = getNavigationForRole("ASISTENTE_TECNICO");
    const items = navigation.groups.flatMap(({ items }) => items);

    expect(items.map(({ label }) => label)).toEqual([
      "Inicio",
      "Mi agenda",
      "Agenda abierta",
      "Mis monitoreos",
      "Historial",
      "Grabaciones",
      "Notificaciones",
      "Mi perfil"
    ]);
    expect(items.find(({ label }) => label === "Mi agenda")?.href).toBe("/mi-agenda?tab=mes");
    expect(items.find(({ label }) => label === "Mis monitoreos")?.href).toBe("/mi-agenda?tab=proximas");
    expect(items.find(({ label }) => label === "Historial")?.href).toBe("/mi-agenda?tab=historico");
    expect(navigation.mobilePrimary).toHaveLength(4);
  });

  it("marks only the matching view active when multiple links share a route", () => {
    const adminLinks = getNavigationForRole("ADMINISTRACION").groups[0].items;
    const agenda = adminLinks.find(({ label }) => label === "Agenda");
    const meetings = adminLinks.find(({ label }) => label === "Reuniones");
    expect(agenda).toBeDefined();
    expect(meetings).toBeDefined();

    const encountersQuery = new URLSearchParams("vista=encuentros");
    expect(isNavigationItemActive(agenda!, "/reuniones", encountersQuery, true)).toBe(true);
    expect(isNavigationItemActive(meetings!, "/reuniones", encountersQuery, true)).toBe(false);

    const defaultSeriesQuery = new URLSearchParams();
    expect(isNavigationItemActive(agenda!, "/reuniones", defaultSeriesQuery, true)).toBe(false);
    expect(isNavigationItemActive(meetings!, "/reuniones", defaultSeriesQuery, true)).toBe(true);
  });
});
