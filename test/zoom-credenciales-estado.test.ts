import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { obtenerCredencialesZoom } from "../src/modules/configuracion/zoom-config.service";

const dbCon = (findUnique: () => Promise<unknown>) =>
  ({ configuracionZoom: { findUnique } }) as unknown as PrismaClient;

describe("diagnóstico de credenciales Zoom", () => {
  afterEach(() => vi.unstubAllEnvs());

  function sinEntorno() {
    vi.stubEnv("ZOOM_ACCOUNT_ID", "");
    vi.stubEnv("ZOOM_CLIENT_ID", "");
    vi.stubEnv("ZOOM_CLIENT_SECRET", "");
  }

  it("distingue credenciales ausentes de errores de consulta", async () => {
    sinEntorno();
    const resultado = await obtenerCredencialesZoom(
      dbCon(async () => null),
      () => ""
    );
    expect(resultado).toMatchObject({ disponible: false, diagnostico: "AUSENTES" });
    expect(resultado).toHaveProperty("error", "No hay credenciales Zoom activas y completas disponibles.");
    const inactiva = await obtenerCredencialesZoom(
      dbCon(async () => ({
        activa: false,
        accountId: "cuenta",
        clientId: "cliente",
        clientSecretCifrado: "cifrado"
      })),
      () => "clave"
    );
    expect(inactiva).toMatchObject({
      disponible: false,
      diagnostico: "AUSENTES",
      error: "No hay credenciales Zoom activas y completas disponibles."
    });
  });

  it("identifica errores de lectura o descifrado sin revelar detalles", async () => {
    sinEntorno();
    const lectura = await obtenerCredencialesZoom(
      dbCon(async () => {
        throw new Error("secreto");
      }),
      () => ""
    );
    const descifrado = await obtenerCredencialesZoom(
      dbCon(async () => ({
        activa: true,
        accountId: "cuenta",
        clientId: "cliente",
        clientSecretCifrado: "cifrado"
      })),
      () => {
        throw new Error("secreto");
      }
    );
    expect(lectura).toMatchObject({ disponible: false, diagnostico: "ERROR_COMPROBACION" });
    expect(descifrado).toMatchObject({ disponible: false, diagnostico: "ERROR_COMPROBACION" });
    expect(lectura).toHaveProperty("error", "No se pudieron comprobar las credenciales Zoom.");
    expect(JSON.stringify([lectura, descifrado])).not.toContain("secreto");
  });

  it("mantiene el respaldo de entorno cuando falla la lectura", async () => {
    vi.stubEnv("ZOOM_ACCOUNT_ID", "cuenta");
    vi.stubEnv("ZOOM_CLIENT_ID", "cliente");
    vi.stubEnv("ZOOM_CLIENT_SECRET", "clave");
    const resultado = await obtenerCredencialesZoom(
      dbCon(async () => {
        throw new Error("error");
      }),
      () => ""
    );
    expect(resultado).toMatchObject({ disponible: true, origen: "ENV" });
    const descifrado = await obtenerCredencialesZoom(
      dbCon(async () => ({
        activa: true,
        accountId: "cuenta",
        clientId: "cliente",
        clientSecretCifrado: "cifrado"
      })),
      () => {
        throw new Error("error");
      }
    );
    expect(descifrado).toMatchObject({ disponible: true, origen: "ENV" });
  });
});
