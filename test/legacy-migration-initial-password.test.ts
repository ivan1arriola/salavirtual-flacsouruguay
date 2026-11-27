import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migración de usuarios legacy: credenciales iniciales", () => {
  const script = readFileSync(
    new URL("../scripts/migrate-legacy-users.ts", import.meta.url),
    "utf8",
  );

  it("no utiliza una contraseña compartida para usuarios sin credenciales", () => {
    expect(script).not.toContain("MIGRATION_DEFAULT_PASSWORD");
    expect(script).not.toContain("guardarPasswordInicialCifrada");
    expect(script).not.toContain("refresh_token: account.refresh_token");
    expect(script).not.toContain("access_token: account.access_token");
    expect(script).toContain("ownership.userId !== plan.usuarioId");
    expect(script).toContain("const passwordHash = plan.passwordHash ?? null;");
    expect(script).toContain("passwordInicialCifrada: null");
  });

  it("bloquea importaciones sin mecanismo de activación", () => {
    expect(script).toContain("const invalid = planes.filter(");
    expect(script).toContain("Migración bloqueada:");
  });
});
