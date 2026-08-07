import { describe, expect, it } from "vitest";
import {
  invitarUsuarioSchema,
  puedeInvitarUsuarios
} from "../src/modules/usuarios/invitaciones.domain";

describe("invitaciones de usuarios", () => {
  it("reserva las invitaciones a Administración activa", () => {
    expect(puedeInvitarUsuarios({ rol: "ADMINISTRACION", activo: true })).toBe(true);
    expect(puedeInvitarUsuarios({ rol: "DOCENTE", activo: true })).toBe(false);
    expect(puedeInvitarUsuarios({ rol: "ADMINISTRACION", activo: false })).toBe(false);
  });

  it("acepta un docente FLACSO con un programa existente", () => {
    expect(invitarUsuarioSchema.safeParse({
      nombres: "Ana",
      apellidos: "Pérez",
      email: "ANA@FLACSO.EDU.UY",
      rol: "DOCENTE",
      programaId: "programa",
      programaNuevo: ""
    }).success).toBe(true);
  });

  it("rechaza correos externos y docentes sin programa", () => {
    expect(invitarUsuarioSchema.safeParse({
      nombres: "Ana",
      email: "ana@gmail.com",
      rol: "DOCENTE",
      programaId: "programa"
    }).success).toBe(false);
    expect(invitarUsuarioSchema.safeParse({
      nombres: "Ana",
      email: "ana@flacso.edu.uy",
      rol: "DOCENTE",
      programaId: "",
      programaNuevo: ""
    }).success).toBe(false);
  });
});
