import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEncryptionKey } from "../src/modules/configuracion/encryption-key.domain";

const originalKey = process.env.CONFIG_ENCRYPTION_KEY;
const validKey = "0123456789abcdef".repeat(4);

afterEach(() => {
  if (originalKey === undefined) delete process.env.CONFIG_ENCRYPTION_KEY;
  else process.env.CONFIG_ENCRYPTION_KEY = originalKey;
  vi.resetModules();
});

describe("clave de cifrado", () => {
  it("acepta exactamente 32 bytes expresados en hexadecimal", () => {
    expect(parseEncryptionKey(validKey)).toBe(validKey);
    expect(parseEncryptionKey(validKey.toUpperCase())).toBe(validKey.toUpperCase());
  });

  it("rechaza claves con longitud o caracteres inválidos", () => {
    expect(() => parseEncryptionKey("ab".repeat(31))).toThrow("32 bytes");
    expect(() => parseEncryptionKey("z".repeat(64))).toThrow("32 bytes");
    expect(() => parseEncryptionKey(undefined)).toThrow();
  });
});

describe("cifrado de configuración", () => {
  async function moduleWithKey() {
    process.env.CONFIG_ENCRYPTION_KEY = validKey;
    vi.resetModules();
    return import("../src/lib/config/encryption");
  }

  it("cifra y descifra conservando el valor original", async () => {
    const { cifrarConfiguracion, descifrarConfiguracion } = await moduleWithKey();
    const encrypted = cifrarConfiguracion("secreto de prueba");

    expect(encrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(descifrarConfiguracion(encrypted)).toBe("secreto de prueba");
  });

  it("usa un IV aleatorio para no repetir el mismo ciphertext", async () => {
    const { cifrarConfiguracion } = await moduleWithKey();
    const first = cifrarConfiguracion("mismo valor");
    const second = cifrarConfiguracion("mismo valor");

    expect(first).not.toBe(second);
  });

  it("rechaza formatos incompletos o de una versión desconocida", async () => {
    const { descifrarConfiguracion } = await moduleWithKey();

    expect(() => descifrarConfiguracion("v2:a:b:c")).toThrow("formato invalido");
    expect(() => descifrarConfiguracion("v1:a:b")).toThrow("formato invalido");
  });

  it("detecta manipulación del contenido autenticado", async () => {
    const { cifrarConfiguracion, descifrarConfiguracion } = await moduleWithKey();
    const encrypted = cifrarConfiguracion("no modificar");
    const [version, iv, tag, payload] = encrypted.split(":");
    const tamperedTag = `${tag?.startsWith("A") ? "B" : "A"}${tag?.slice(1) ?? ""}`;

    expect(() => descifrarConfiguracion(`${version}:${iv}:${tamperedTag}:${payload}`)).toThrow();
  });
});
