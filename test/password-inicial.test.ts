import { describe, expect, it } from "vitest";
import {
  guardarPasswordInicialCifrada,
  leerPasswordInicialCifrada
} from "../src/modules/usuarios/password-inicial.service";

describe("password inicial cifrada", () => {
  it("guarda y lee la contrasena temporal usando cifrado externo", () => {
    const cifradas = new Map<string, string>();
    const cifrar = (value: string) => {
      const token = `secret:${cifradas.size + 1}`;
      cifradas.set(token, value);
      return token;
    };
    const descifrar = (value: string) => {
      const original = cifradas.get(value);
      if (!original) throw new Error("token invalido");
      return original;
    };

    const guardada = guardarPasswordInicialCifrada("Temporal2026!", { cifrar });

    expect(guardada).not.toBe("Temporal2026!");
    expect(leerPasswordInicialCifrada(guardada, { descifrar })).toBe("Temporal2026!");
    expect(leerPasswordInicialCifrada(null, { descifrar })).toBeNull();
  });
});
