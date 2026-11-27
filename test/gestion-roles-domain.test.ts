import { describe, expect, it } from "vitest";
import {
  cambiarRolUsuarioSchema,
  puedeGestionarRoles,
  requierePerfilAsistente,
  requierePerfilDocente,
} from "../src/modules/usuarios/gestion-roles.domain";

describe("gestion de roles", () => {
  it("queda reservada a usuarios activos de Administracion", () => {
    expect(puedeGestionarRoles({ id: "admin", rol: "ADMINISTRACION", activo: true })).toBe(true);
    expect(puedeGestionarRoles({ id: "docente", rol: "DOCENTE", activo: true })).toBe(false);
    expect(puedeGestionarRoles({ id: "admin", rol: "ADMINISTRACION", activo: false })).toBe(false);
  });

  it("acepta solamente roles normalizados", () => {
    expect(cambiarRolUsuarioSchema.parse({ rol: "DOCENTE" })).toEqual({ rol: "DOCENTE" });
    expect(() => cambiarRolUsuarioSchema.parse({ rol: "CONTABILIDAD" })).toThrow();
  });

  it("determina el perfil especializado necesario", () => {
    expect(requierePerfilDocente("DOCENTE")).toBe(true);
    expect(requierePerfilDocente("ADMINISTRACION")).toBe(false);
    expect(requierePerfilAsistente("ASISTENTE_TECNICO")).toBe(true);
    expect(requierePerfilAsistente("DOCENTE")).toBe(false);
  });
});
