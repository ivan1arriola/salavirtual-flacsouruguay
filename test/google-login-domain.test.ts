import { describe, expect, it } from "vitest";
import {
  evaluarAccesoGoogle,
  esPerfilGoogleInstitucional,
  esPerfilGoogleVerificado,
  resolverVinculacionSubjectGoogle,
  type CuentaGoogleVinculada,
  type PerfilGoogle,
} from "../src/modules/usuarios/google-login.domain";

const perfil: PerfilGoogle = {
  subject: "google-subject",
  email: "docente@flacso.edu.uy",
  emailVerificado: true,
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
    email: "docente@flacso.edu.uy",
  },
};

describe("login funcional con Google", () => {
  it("resuelve una cuenta institucional vinculada", () => {
    expect(evaluarAccesoGoogle(perfil, cuenta)?.id).toBe("docente");
  });

  it("acepta cuentas externas verificadas cuando están vinculadas", () => {
    const cuentaExterna = { ...cuenta, email: "docente@gmail.com" };
    expect(evaluarAccesoGoogle({ ...perfil, email: "docente@gmail.com" }, cuentaExterna)?.id).toBe(
      "docente",
    );
  });

  it("rechaza perfiles no verificados o no vinculados", () => {
    expect(evaluarAccesoGoogle({ ...perfil, emailVerificado: false }, cuenta)).toBeNull();
    expect(evaluarAccesoGoogle(perfil, null)).toBeNull();
  });

  it("habilita el autorregistro para cualquier perfil Google verificado con email", () => {
    expect(esPerfilGoogleVerificado(perfil)).toBe(true);
    expect(esPerfilGoogleVerificado({ ...perfil, email: "persona@gmail.com" })).toBe(true);
    expect(esPerfilGoogleVerificado({ ...perfil, emailVerificado: false })).toBe(false);
    expect(esPerfilGoogleVerificado({ ...perfil, email: "" })).toBe(false);
  });

  it("distingue los perfiles institucionales para el autorregistro inmediato", () => {
    expect(esPerfilGoogleInstitucional(perfil)).toBe(true);
    expect(esPerfilGoogleInstitucional({ ...perfil, email: "persona@gmail.com" })).toBe(false);
  });

  it("permite revalidar el subject de una cuenta Google", () => {
    expect(resolverVinculacionSubjectGoogle(null, "subject-nuevo", false)).toBe("REVINCULAR");
    expect(resolverVinculacionSubjectGoogle("subject-anterior", "subject-nuevo", false)).toBe(
      "REVINCULAR",
    );
    expect(resolverVinculacionSubjectGoogle("subject-nuevo", "subject-nuevo", false)).toBe(
      "MANTENER",
    );
    expect(resolverVinculacionSubjectGoogle("subject-anterior", "subject-nuevo", true)).toBe(
      "RECHAZAR",
    );
  });
});
