import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(new URL("../src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/(gestion)/reuniones/reuniones-zoom.module.css", import.meta.url), "utf8");

describe("lista de reuniones de Zoom: día y cuenta anfitriona", () => {
  it("agrupa por día con el dominio y encabeza cada día con su fecha y la cantidad", () => {
    expect(pagina).toContain("agruparPorDia(series,");
    expect(pagina).toContain("agruparPorDia(encuentros,");
    expect(pagina).toContain("styles.diaTitulo");
    expect(pagina).toContain('aria-labelledby={`dia-${dia.clave}`}');
    expect(pagina).toContain('HOY: "Hoy", MANANA: "Mañana"');
  });

  it("el color identifica la cuenta anfitriona y ya no la serie", () => {
    expect(pagina).not.toContain("data-tone");
    expect(pagina).not.toContain("tonoSerie");
    expect(pagina).toContain("data-cuenta=");
    expect(pagina).toContain("colorCuentaZoom(enlace.cuentaAnfitrion)");
  });

  it("la cuenta se muestra también en texto y hay una leyenda de cuentas", () => {
    expect(pagina).toContain("function ChipCuenta");
    expect(pagina).toContain("nombreCuentaZoom(correo)");
    expect(pagina).toContain('aria-label="Cuentas anfitrionas"');
    expect(pagina).toContain("cuentasPresentes(");
  });

  it("el CSS define un color por cuenta para la tarjeta, el chip y la leyenda, con selectores locales", () => {
    const reglas = [...css.matchAll(/\.item\[data-cuenta="(\d+)"\]/g)].map((m) => Number(m[1]));
    expect(reglas.length).toBeGreaterThanOrEqual(10);
    expect(new Set(reglas).size).toBe(reglas.length);
    expect(css).toContain('.cuentaChip[data-cuenta="0"]');
    expect(css).toContain('.leyenda li[data-cuenta="0"]');
    expect(css).not.toMatch(/data-tone/);
    expect(css).toContain(".diaTitulo");
  });

  it("los colores de la paleta no se repiten", () => {
    const fuertes = [...css.matchAll(/\.item\[data-cuenta="\d+"\][^{]*\{ --tone: (#[0-9a-f]{6});/gi)].map((m) => m[1].toLowerCase());
    expect(new Set(fuertes).size).toBe(fuertes.length);
  });
});
