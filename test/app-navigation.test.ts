import { describe, expect, it } from "vitest";
import {
  getNavigationForRole,
  getSecondaryNavigation,
  isNavigationItemActive,
} from "@/src/components/app-navigation";

describe("navegación por rol", () => {
  it("prioriza las operaciones y permite crear reuniones desde móvil", () => {
    const navigation = getNavigationForRole("ADMINISTRACION");
    expect(navigation.groups.map(({ label }) => label)).toEqual([
      "Operaciones",
      "Administración",
      "Sistema",
    ]);
    expect(navigation.mobilePrimary.map(({ label }) => label)).toEqual([
      "Inicio",
      "Agenda",
      "Nueva reunión",
      "Monitoreo",
    ]);
    expect(navigation.groups.flatMap(({ items }) => items.map(({ href }) => href))).toContain(
      "/notificaciones",
    );
    expect(
      getSecondaryNavigation(navigation).flatMap(({ items }) => items.map(({ label }) => label)),
    ).toContain("Series y reuniones");
  });

  it("prioriza clases, creación y grabaciones para docentes", () => {
    const navigation = getNavigationForRole("DOCENTE");
    expect(navigation.mobilePrimary.map(({ href }) => href)).toEqual([
      "/",
      "/mis-clases",
      "/reuniones/nueva",
      "/grabaciones",
    ]);
  });

  it("prioriza trabajo asignado y postulaciones para asistentes", () => {
    const navigation = getNavigationForRole("ASISTENTE_TECNICO");
    expect(navigation.mobilePrimary.map(({ href }) => href)).toEqual([
      "/",
      "/mi-agenda?tab=proximas",
      "/agenda-abierta",
      "/agenda-abierta?vista=postulaciones",
    ]);
    expect(navigation.groups.flatMap(({ items }) => items.map(({ href }) => href))).toContain(
      "/mi-agenda?tab=historico",
    );
  });

  it("mantiene exactamente una sección activa en las vistas compartidas", () => {
    const items = getNavigationForRole("ADMINISTRACION").groups.flatMap(({ items }) => items);
    const active = (path: string, query = "") =>
      items
        .filter((item) => isNavigationItemActive(item, path, new URLSearchParams(query), true))
        .map(({ label }) => label);
    expect(active("/reuniones", "vista=encuentros")).toEqual(["Agenda"]);
    expect(active("/reuniones")).toEqual(["Series y reuniones"]);
    expect(active("/reuniones/abc")).toEqual(["Series y reuniones"]);
    expect(active("/reuniones/nueva")).toEqual(["Nueva reunión"]);
  });

  it("conserva la sección activa al navegar por la agenda y postulaciones", () => {
    const items = getNavigationForRole("ASISTENTE_TECNICO").groups.flatMap(({ items }) => items);
    const active = (path: string, query = "") =>
      items
        .filter((item) => isNavigationItemActive(item, path, new URLSearchParams(query)))
        .map(({ label }) => label);
    expect(active("/agenda-abierta")).toEqual(["Agenda abierta"]);
    expect(active("/agenda-abierta", "vista=postulaciones")).toEqual(["Mis postulaciones"]);
    expect(active("/mi-agenda", "tab=mes")).toEqual(["Mi agenda"]);
    expect(active("/operacion/abc")).toEqual(["Mi agenda"]);
    expect(active("/mi-agenda", "tab=historico")).toEqual(["Horas e historial"]);
  });
});
