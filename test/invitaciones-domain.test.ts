import { describe, expect, it } from "vitest";
import {
  invitarUsuarioSchema,
  puedeInvitarUsuarios,
} from "../src/modules/usuarios/invitaciones.domain";

describe("invitaciones de usuarios", () => {
  it("reserva las invitaciones a Administración activa", () => {
    expect(puedeInvitarUsuarios({ rol: "ADMINISTRACION", activo: true })).toBe(true);
    expect(puedeInvitarUsuarios({ rol: "DOCENTE", activo: true })).toBe(false);
    expect(puedeInvitarUsuarios({ rol: "ADMINISTRACION", activo: false })).toBe(false);
  });

  it("acepta un docente con un programa existente sin restringir el dominio", () => {
    expect(
      invitarUsuarioSchema.safeParse({
        nombres: "Ana",
        apellidos: "Pérez",
        email: "ANA@GMAIL.COM",
        rol: "DOCENTE",
        programaId: "programa",
        programaNuevo: "",
      }).success,
    ).toBe(true);
  });

  it("sigue exigiendo un programa para docentes", () => {
    expect(
      invitarUsuarioSchema.safeParse({
        nombres: "Ana",
        email: "ana@gmail.com",
        rol: "DOCENTE",
        programaId: "",
        programaNuevo: "",
      }).success,
    ).toBe(false);
  });
});
