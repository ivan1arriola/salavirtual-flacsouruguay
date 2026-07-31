import { describe, expect, it } from "vitest";
import {
  evaluarAccesoLocal,
  type UsuarioCredenciales
} from "../src/modules/usuarios/credentials.domain";

const usuarioActivo: UsuarioCredenciales = {
  id: "docente",
  passwordHash: "hash",
  rol: "DOCENTE",
  activo: true,
  fusionadoEnId: null,
  nombre: "Docente FLACSO",
  email: "docente@flacso.edu.uy"
};

describe("acceso local funcional", () => {
  it("autoriza una cuenta activa con password valida", () => {
    expect(evaluarAccesoLocal(usuarioActivo, true)).toEqual({
      id: "docente",
      rol: "DOCENTE",
      nombre: "Docente FLACSO",
      email: "docente@flacso.edu.uy"
    });
  });

  it("rechaza passwords invalidas y usuarios fusionados", () => {
    expect(evaluarAccesoLocal(usuarioActivo, false)).toBeNull();
    expect(
      evaluarAccesoLocal({ ...usuarioActivo, fusionadoEnId: "docente-principal" }, true)
    ).toBeNull();
  });
});
