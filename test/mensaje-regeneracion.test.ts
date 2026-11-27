import { describe, expect, it } from "vitest";
import { mensajeRegeneracion } from "../src/components/attendance-regenerate-action";

describe("mensajeRegeneracion", () => {
  it("avisa que Zoom aún no entregó el reporte cuando todo dio 404", () => {
    expect(
      mensajeRegeneracion({
        resultados: [{ sincronizacion: "PENDIENTE" }, { sincronizacion: "PENDIENTE" }],
      }),
    ).toBe("Zoom aún no entregó el reporte. Volvé a intentar más tarde.");
  });

  it("da por terminada la sincronización si alguna ocurrencia trajo datos", () => {
    expect(
      mensajeRegeneracion({
        resultados: [{ sincronizacion: "PENDIENTE" }, { sincronizacion: "OK" }],
      }),
    ).toBe("Sincronización terminada. Actualizando la vista…");
  });

  it("informa el error cuando ninguna ocurrencia se pudo sincronizar", () => {
    expect(mensajeRegeneracion({ resultados: [{ sincronizacion: "ERROR" }] })).toBe(
      "No se pudo sincronizar con Zoom. Volvé a intentar más tarde.",
    );
  });

  it("conserva el mensaje de Google mientras procesa los datos", () => {
    expect(mensajeRegeneracion({ estado: "ARTEFACTOS_PENDIENTES" })).toBe(
      "Google todavía está procesando los datos. Volvé a intentar más tarde.",
    );
  });
});
