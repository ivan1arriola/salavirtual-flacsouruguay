import { describe, expect, it } from "vitest";
import {
  crearUsuarioIdBase,
  planificarMigracionUsuarios,
  type CuentaGoogleLegacy,
  type UsuarioLegacy
} from "../src/modules/migracion/usuarios-legacy.domain";

const googleAccount = (providerAccountId: string): CuentaGoogleLegacy => ({
  providerAccountId,
  refresh_token: null,
  access_token: null,
  expires_at: null,
  token_type: null,
  scope: null,
  id_token: null,
  session_state: null
});

const legacyUser = (overrides: Partial<UsuarioLegacy> = {}): UsuarioLegacy => ({
  id: "legacy-1",
  firstName: "Ana",
  lastName: "Perez",
  name: "Ana Perez",
  email: "Ana.Perez@flacso.edu.uy",
  emailVerified: null,
  image: null,
  passwordHash: null,
  role: "CONTADURIA",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
  lastLoginAt: null,
  lastLoginIp: null,
  lastLoginUserAgent: null,
  lastLoginProvider: null,
  emailAliases: [],
  accounts: [],
  docenteProfile: null,
  asistenteProfile: null,
  ...overrides
});

describe("plan funcional de migracion de usuarios", () => {
  it("genera ids locales estables desde el correo", () => {
    expect(crearUsuarioIdBase("Ana.Perez@flacso.edu.uy")).toBe("ana.perez");
    expect(crearUsuarioIdBase(" José + Técnico @flacso.edu.uy")).toBe("jose.tecnico");
  });

  it("genera un fallback válido cuando la parte local es demasiado corta o vacía", () => {
    expect(crearUsuarioIdBase("ab@flacso.edu.uy")).toBe("usuario.ab");
    expect(crearUsuarioIdBase("@flacso.edu.uy")).toBe("usuario.legacy");
  });

  it("absorbe Contabilidad y resuelve colisiones", () => {
    const planes = planificarMigracionUsuarios(
      [
        legacyUser(),
        legacyUser({
          id: "legacy-2",
          email: "ana.perez@example.com",
          role: "DOCENTE"
        })
      ],
      new Set(),
      new Map()
    );

    expect(planes.map(({ usuarioId }) => usuarioId)).toEqual(["ana.perez", "ana.perez-2"]);
    expect(planes[0]?.rol).toBe("ADMINISTRACION");
  });

  it("respeta un ID ya migrado aunque el ID base esté reservado", () => {
    const [plan] = planificarMigracionUsuarios(
      [legacyUser()],
      new Set(["ana.perez"]),
      new Map([["legacy-1", "usuario-existente"]])
    );

    expect(plan?.usuarioId).toBe("usuario-existente");
  });

  it("usa nombre alternativo, limpia apellido y aplica DOCENTE a roles desconocidos", () => {
    const [plan] = planificarMigracionUsuarios(
      [legacyUser({
        firstName: "   ",
        name: "  Nombre alternativo  ",
        lastName: "   ",
        role: "ROL_DESCONOCIDO"
      })],
      new Set(),
      new Map()
    );

    expect(plan).toMatchObject({
      nombres: "Nombre alternativo",
      apellidos: null,
      rol: "DOCENTE"
    });
  });

  it("usa el ID local como último fallback de nombre", () => {
    const [plan] = planificarMigracionUsuarios(
      [legacyUser({ firstName: null, name: null })],
      new Set(),
      new Map()
    );
    expect(plan?.nombres).toBe("ana.perez");
  });

  it("normaliza aliases y conserva cuentas Google correspondientes a emails FLACSO", () => {
    const [plan] = planificarMigracionUsuarios(
      [legacyUser({
        email: " Persona@FLACSO.EDU.UY ",
        emailAliases: [
          { email: " ALIAS@FLACSO.EDU.UY " },
          { email: "externo@gmail.com" }
        ],
        accounts: [googleAccount("google-1"), googleAccount("google-2"), googleAccount("google-3")]
      })],
      new Set(),
      new Map()
    );

    expect(plan?.emailPrincipal).toBe("persona@flacso.edu.uy");
    expect(plan?.aliases).toEqual(["alias@flacso.edu.uy", "externo@gmail.com"]);
    expect(plan?.cuentasGoogle.map(({ providerAccountId }) => providerAccountId)).toEqual(["google-1", "google-2"]);
    expect(plan?.cuentasGoogleOmitidas).toBe(1);
  });

  it("omite cuentas Google externas", () => {
    const [plan] = planificarMigracionUsuarios(
      [
        legacyUser({
          email: "persona@gmail.com",
          accounts: [googleAccount("google-subject")]
        })
      ],
      new Set(),
      new Map()
    );

    expect(plan?.cuentasGoogle).toHaveLength(0);
    expect(plan?.cuentasGoogleOmitidas).toBe(1);
  });

  it("falla de forma explícita si se agotan los sufijos de colisión", () => {
    const base = "ana.perez";
    const reservados = new Set([
      base,
      ...Array.from({ length: 998 }, (_, index) => `${base}-${index + 2}`)
    ]);

    expect(() => planificarMigracionUsuarios(
      [legacyUser()],
      reservados,
      new Map()
    )).toThrow(`No se pudo generar un usuario unico para ${base}.`);
  });
});
