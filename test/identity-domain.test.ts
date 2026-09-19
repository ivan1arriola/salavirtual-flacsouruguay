import { describe, expect, it } from "vitest";
import {
  esRolUsuario,
  puedeAdministrar,
  evaluarAccesoLocal,
  evaluarAccesoGoogle,
  esPerfilGoogleVerificado,
  esPerfilGoogleInstitucional,
  resolverVinculacionSubjectGoogle,
  parseAuthConfig,
  resolverRedireccionAutorizada,
  type PerfilGoogle,
  type CuentaGoogleVinculada
} from "@/src/modules/identity/domain";

describe("identity domain", () => {
  it("valida roles permitidos", () => {
    expect(esRolUsuario("ADMINISTRACION")).toBe(true);
    expect(esRolUsuario("ASISTENTE_TECNICO")).toBe(true);
    expect(esRolUsuario("DOCENTE")).toBe(true);
    expect(esRolUsuario("INVALIDO")).toBe(false);
    expect(puedeAdministrar("ADMINISTRACION")).toBe(true);
    expect(puedeAdministrar("DOCENTE")).toBe(false);
  });

  it("evalua acceso local con credenciales", () => {
    const usuario = {
      id: "usr-1",
      passwordHash: "hash",
      debeCambiarPassword: false,
      rol: "DOCENTE" as const,
      activo: true,
      fusionadoEnId: null,
      nombre: "Docente Test",
      email: "docente@flacso.edu.uy"
    };

    expect(evaluarAccesoLocal(usuario, true)?.id).toBe("usr-1");
    expect(evaluarAccesoLocal(usuario, false)).toBeNull();
    expect(evaluarAccesoLocal({ ...usuario, activo: false }, true)).toBeNull();
    expect(evaluarAccesoLocal({ ...usuario, fusionadoEnId: "otro" }, true)).toBeNull();
  });

  it("evalua acceso con Google", () => {
    const perfil: PerfilGoogle = {
      subject: "sub-123",
      email: "docente@flacso.edu.uy",
      emailVerificado: true
    };
    const cuenta: CuentaGoogleVinculada = {
      providerAccountId: "sub-123",
      email: "docente@flacso.edu.uy",
      usuario: {
        id: "usr-1",
        rol: "DOCENTE",
        debeCambiarPassword: false,
        activo: true,
        fusionadoEnId: null,
        nombre: "Docente Test",
        email: "docente@flacso.edu.uy"
      }
    };

    expect(evaluarAccesoGoogle(perfil, cuenta)?.id).toBe("usr-1");
    expect(evaluarAccesoGoogle({ ...perfil, emailVerificado: false }, cuenta)).toBeNull();
    expect(esPerfilGoogleInstitucional(perfil)).toBe(true);
    expect(esPerfilGoogleInstitucional({ ...perfil, email: "otro@gmail.com" })).toBe(false);
    expect(resolverVinculacionSubjectGoogle("sub-antiguo", "sub-nuevo", false)).toBe("REVINCULAR");
  });

  it("valida configuracion de autenticacion y redirecciones", () => {
    const config = parseAuthConfig({
      AUTH_SECRET: "a".repeat(64),
      AUTH_TRUST_HOST: "true",
      APP_BASE_URL: "http://localhost:3000"
    });
    expect(config.trustHost).toBe(true);
    expect(resolverRedireccionAutorizada("/reuniones", "http://localhost:3000")).toBe(
      "http://localhost:3000/reuniones"
    );
  });
});
