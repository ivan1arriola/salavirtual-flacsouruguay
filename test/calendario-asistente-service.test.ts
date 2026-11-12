import { describe, expect, it } from "vitest";
import { intentarSincronizacionCalendarioAsistente } from "../src/modules/asistencia/calendario-asistente-safe.service";

describe("sincronizacion segura del calendario de asistentes", () => {
  it("devuelve resultados cuando la sincronizacion termina correctamente", async () => {
    const result = await intentarSincronizacionCalendarioAsistente(async () => [
      {
        cuentaGoogleId: "google-1",
        email: "asistente@flacso.edu.uy",
        accion: "PUBLICAR" as const,
        estado: "SINCRONIZADA" as const
      }
    ]);

    expect(result.error).toBeNull();
    expect(result.resultados).toHaveLength(1);
    expect(result.resultados[0]?.estado).toBe("SINCRONIZADA");
  });

  it("convierte una falla de infraestructura en sincronizacion pendiente sin propagarla", async () => {
    const result = await intentarSincronizacionCalendarioAsistente(async () => {
      throw new Error("database temporarily unavailable");
    });

    expect(result.resultados).toEqual([]);
    expect(result.error).toBe("database temporarily unavailable");
  });

  it("normaliza errores no Error", async () => {
    const result = await intentarSincronizacionCalendarioAsistente(async () => {
      throw "failure";
    });

    expect(result.resultados).toEqual([]);
    expect(result.error).toBe("No se pudo sincronizar Google Calendar.");
  });
});
