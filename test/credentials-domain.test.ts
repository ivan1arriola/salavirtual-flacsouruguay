import { describe, expect, it } from "vitest";
import {
  credencialesLoginSchema,
  esCorreoAcceso,
  evaluarAccesoLocal,
  normalizarIdentificadorAcceso,
  type UsuarioCredenciales
} from "../src/modules/usuarios/credentials.domain";

const usuarioActivo: UsuarioCredenciales = {
  id: "docente",
  passwordHash: "hash",
  debeCambiarPassword: true,
  rol: "DOCENTE",
  activo: true,
  fusionadoEnId: null,
  nombre: "Docente FLACSO",
  email: "docente@flacso.edu.uy"
};

describe("acceso local funcional", () => {
  it("acepta y normaliza correos como identificador de acceso", () => {
    expect(normalizarIdentificadorAcceso("  ASISTENTE@FLACSO.EDU.UY ")).toBe("asistente@flacso.edu.uy");
    expect(esCorreoAcceso("asistente@flacso.edu.uy")).toBe(true);
    expect(credencialesLoginSchema.parse({ usuario: " ASISTENTE@FLACSO.EDU.UY ", password: "clave" }).usuario).toBe("asistente@flacso.edu.uy");
  });

  it("autoriza una cuenta activa con password valida", () => {
    expect(evaluarAccesoLocal(usuarioActivo, true)).toEqual({
      id: "docente",
      rol: "DOCENTE",
      nombre: "Docente FLACSO",
      email: "docente@flacso.edu.uy",
      debeCambiarPassword: true
    });
  });

  it("rechaza passwords invalidas y usuarios fusionados", () => {
    expect(evaluarAccesoLocal(usuarioActivo, false)).toBeNull();
    expect(
      evaluarAccesoLocal({ ...usuarioActivo, fusionadoEnId: "docente-principal" }, true)
    ).toBeNull();
  });
});
