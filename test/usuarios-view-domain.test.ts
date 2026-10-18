import { describe, expect, it } from "vitest";
import { resolveUsersView } from "../src/modules/usuarios/users-view.domain";

describe("vistas de Personas y programas", () => {
  it("abre Personas por defecto para mantener los enlaces existentes", () => {
    expect(resolveUsersView()).toBe("personas");
    expect(resolveUsersView("otra")).toBe("personas");
  });

  it("abre Programas con su query explícita", () => {
    expect(resolveUsersView("programas")).toBe("programas");
  });
});
