import { describe, expect, it } from "vitest";
import {
  crearHrefGrabaciones,
  normalizarParametrosGrabaciones,
} from "../src/modules/archivos/domain/grabaciones-query.domain";
describe("grabaciones query URL", () => {
  it("normaliza parámetros inválidos", () =>
    expect(normalizarParametrosGrabaciones({ pagina: "x", filtro: "X" })).toEqual({
      pagina: 1,
      busqueda: "",
      filtro: "TODOS",
    }));
  it("conserva búsqueda y filtro al navegar y reinicia al cambiar criterio", () => {
    const state = { pagina: 3, busqueda: "seminario", filtro: "ASISTENCIAS" as const };
    expect(crearHrefGrabaciones(state, { pagina: 4 })).toBe(
      "/grabaciones?pagina=4&busqueda=seminario&filtro=ASISTENCIAS",
    );
    expect(crearHrefGrabaciones(state, { busqueda: "clase", pagina: 1 })).toBe(
      "/grabaciones?busqueda=clase&filtro=ASISTENCIAS",
    );
  });
});
