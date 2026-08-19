import { describe, expect, it } from "vitest";
import { passwordSala } from "../scripts/email-message-helpers";

describe("credenciales de cuentas Meet en mensajes", () => {
  it("usa la contraseña guardada para cualquier correo de cuenta", () => {
    const password = passwordSala(
      {
        nombre: "Host principal",
        emailOrganizador: "meet-principal@flacso.edu.uy",
        secretRef: "credencial-cifrada"
      },
      (value) => value === "credencial-cifrada" ? "Clave-Nueva-2026+" : ""
    );

    expect(password).toBe("Clave-Nueva-2026+");
  });

  it("no deriva contraseñas a partir del nombre o correo", () => {
    expect(passwordSala({
      nombre: "Sala 01",
      emailOrganizador: "sala01@flacso.edu.uy",
      secretRef: null
    }, (value) => value)).toBeNull();
  });

  it("omite una credencial que no puede descifrarse", () => {
    expect(passwordSala({
      nombre: "Host",
      emailOrganizador: "host@flacso.edu.uy",
      secretRef: "invalida"
    }, () => {
      throw new Error("No se pudo descifrar");
    })).toBeNull();
  });
});
