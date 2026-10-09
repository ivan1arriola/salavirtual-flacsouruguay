import { describe, expect, it } from "vitest";
import { reconciliarEventosCalendarioSalas } from "../src/modules/reuniones/calendario-salas.domain";
import { resolverSemanaCalendarioSalas } from "../src/modules/reuniones/calendario-salas.service";

describe("calendario de salas", () => {
  it("abre la semana que corresponde a Montevideo aunque el servidor esté en UTC", () => {
    expect(resolverSemanaCalendarioSalas(undefined, new Date("2026-10-09T01:00:00Z"))).toEqual({
      desde: new Date("2026-10-05T03:00:00Z"),
      hasta: new Date("2026-10-12T03:00:00Z")
    });
  });

  it("vincula un evento de Google con el encuentro administrado por Sala Virtual", () => {
    const events = reconciliarEventosCalendarioSalas(
      [{ id: "google-1", titulo: "Clase 1", inicio: new Date("2026-10-12T13:00:00Z"), fin: new Date("2026-10-12T14:00:00Z") }],
      [{ instanciaId: "instancia-1", solicitudId: "serie-1", externalEventId: "google-1", titulo: "Clase 1", inicio: new Date("2026-10-12T13:00:00Z"), fin: new Date("2026-10-12T14:00:00Z"), estadoIntegracion: "SINCRONIZADA" }]
    );

    expect(events).toEqual([expect.objectContaining({ estado: "ADMINISTRADA", instanciaId: "instancia-1", solicitudId: "serie-1" })]);
  });

  it("muestra como externo un evento de Google sin encuentro asociado", () => {
    const events = reconciliarEventosCalendarioSalas(
      [{ id: "google-externo", titulo: "Reunión fuera de Sala Virtual", inicio: new Date("2026-10-12T15:00:00Z"), fin: new Date("2026-10-12T16:00:00Z") }],
      []
    );

    expect(events).toEqual([expect.objectContaining({ estado: "EXTERNA" })]);
    expect(events[0]?.instanciaId).toBeUndefined();
    expect(events[0]?.solicitudId).toBeUndefined();
  });

  it("mantiene visible una reunión local que ya no figura en Google Calendar", () => {
    const events = reconciliarEventosCalendarioSalas([], [{
      instanciaId: "instancia-sin-evento", solicitudId: "serie-2", externalEventId: "google-eliminado", titulo: "Clase a recuperar",
      inicio: new Date("2026-10-13T13:00:00Z"), fin: new Date("2026-10-13T14:00:00Z"), estadoIntegracion: "ERROR"
    }]);

    expect(events).toEqual([expect.objectContaining({ estado: "SIN_EVENTO_GOOGLE", instanciaId: "instancia-sin-evento" })]);
  });
});
