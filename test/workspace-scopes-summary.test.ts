import { describe, expect, it } from "vitest";
import { resumirValidacionScopes } from "../src/components/workspace-scopes-summary";

const cuenta = (ok: boolean, faltantes: number) => ({
  subject: "x@flacso.edu.uy",
  tipo: "GENERAL" as const,
  activa: true,
  ok,
  scopes: Array.from({ length: faltantes }, (_, i) => ({
    key: "drive" as const,
    label: `s${i}`,
    scope: "s",
    autorizado: false
  }))
});

describe("resumen de la validación de permisos", () => {
  it("sin cuentas no afirma que todo esté autorizado", () => {
    const r = resumirValidacionScopes([]);
    expect(r.ok).toBe(false);
    expect(r.titulo).toBe("No se pudo validar ninguna cuenta");
    expect(r.detalle).not.toMatch(/autorizados/);
  });

  it("todas correctas", () => {
    expect(resumirValidacionScopes([cuenta(true, 0)])).toEqual({
      ok: true,
      titulo: "1/1 cuentas correctas",
      detalle: "Todos los permisos requeridos están autorizados."
    });
  });

  it("cuenta con permisos faltantes", () => {
    expect(resumirValidacionScopes([cuenta(false, 2)])).toEqual({
      ok: false,
      titulo: "0/1 cuentas correctas",
      detalle: "2 autorizaciones requieren atención."
    });
  });
});
