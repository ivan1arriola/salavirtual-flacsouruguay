import { describe, expect, it } from "vitest";
import {
  evaluarAccesoGoogle,
  esPerfilGoogleInstitucional,
  type CuentaGoogleVinculada,
  type PerfilGoogle
} from "../src/modules/usuarios/google-login.domain";

const perfil: PerfilGoogle = {
  subject: "google-subject",
  email: "docente@flacso.edu.uy",
  emailVerificado: true
};

const cuenta: CuentaGoogleVinculada = {
  providerAccountId: "google-subject",
  email: "docente@flacso.edu.uy",
  usuario: {
    id: "docente",
    rol: "DOCENTE",
    debeCambiarPassword: true,
    activo: true,
    fusionadoEnId: null,
    nombre: "Docente FLACSO",
    email: "docente@flacso.edu.uy"
  }
};

describe("login funcional con Google", () => {
  it("resuelve una cuenta institucional vinculada", () => {
    expect(evaluarAccesoGoogle(perfil, cuenta)?.id).toBe("docente");
  });

  it("rechaza cuentas externas, no verificadas o no vinculadas", () => {
    expect(
      evaluarAccesoGoogle({ ...perfil, email: "docente@gmail.com" }, cuenta)
    ).toBeNull();
    expect(evaluarAccesoGoogle({ ...perfil, emailVerificado: false }, cuenta)).toBeNull();
    expect(evaluarAccesoGoogle(perfil, null)).toBeNull();
  });

  it("habilita el autorregistro solamente para perfiles Google verificados de FLACSO", () => {
    expect(esPerfilGoogleInstitucional(perfil)).toBe(true);
    expect(esPerfilGoogleInstitucional({ ...perfil, email: "persona@gmail.com" })).toBe(false);
    expect(esPerfilGoogleInstitucional({ ...perfil, emailVerificado: false })).toBe(false);
  });
});
