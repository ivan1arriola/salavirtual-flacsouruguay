import { describe, expect, it } from "vitest";
import {
  esErrorNoBloqueanteDeScopesMeet,
  estadoIntegracionEfectivo,
  requiereAtencionIntegracionMeet
} from "../src/modules/meet/integration-health.domain";

describe("salud de integración de Google Meet", () => {
  it("no trata como problema del encuentro un error de scopes si el Meet ya existe", () => {
    const event = {
      estadoIntegracion: "ERROR" as const,
      joinUrl: "https://meet.google.com/abc-defg-hij",
      codigoReunion: "abc-defg-hij",
      errorIntegracion: "Request had insufficient authentication scopes."
    };

    expect(esErrorNoBloqueanteDeScopesMeet(event)).toBe(true);
    expect(requiereAtencionIntegracionMeet(event)).toBe(false);
    expect(estadoIntegracionEfectivo(event)).toBe("SINCRONIZADA");
  });

  it("mantiene como problema un error de scopes si no existe un Meet provisionado", () => {
    const event = {
      estadoIntegracion: "ERROR" as const,
      joinUrl: null,
      codigoReunion: null,
      errorIntegracion: "Request had insufficient authentication scopes."
    };

    expect(esErrorNoBloqueanteDeScopesMeet(event)).toBe(false);
    expect(requiereAtencionIntegracionMeet(event)).toBe(true);
    expect(estadoIntegracionEfectivo(event)).toBe("ERROR");
  });

  it("mantiene como problema los errores reales aunque el enlace Meet exista", () => {
    const event = {
      estadoIntegracion: "ERROR" as const,
      joinUrl: "https://meet.google.com/abc-defg-hij",
      codigoReunion: "abc-defg-hij",
      errorIntegracion: "Google Calendar todavía no refleja la reprogramación solicitada."
    };

    expect(esErrorNoBloqueanteDeScopesMeet(event)).toBe(false);
    expect(requiereAtencionIntegracionMeet(event)).toBe(true);
    expect(estadoIntegracionEfectivo(event)).toBe("ERROR");
  });
});
