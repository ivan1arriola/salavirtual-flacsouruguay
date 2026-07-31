import { describe, expect, it } from "vitest";
import {
  crearUsuarioIdBase,
  planificarMigracionUsuarios,
  type UsuarioLegacy
} from "../src/modules/migracion/usuarios-legacy.domain";

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

  it("omite cuentas Google externas", () => {
    const [plan] = planificarMigracionUsuarios(
      [
        legacyUser({
          email: "persona@gmail.com",
          accounts: [
            {
              providerAccountId: "google-subject",
              refresh_token: null,
              access_token: null,
              expires_at: null,
              token_type: null,
              scope: null,
              id_token: null,
              session_state: null
            }
          ]
        })
      ],
      new Set(),
      new Map()
    );

    expect(plan?.cuentasGoogle).toHaveLength(0);
    expect(plan?.cuentasGoogleOmitidas).toBe(1);
  });
});
