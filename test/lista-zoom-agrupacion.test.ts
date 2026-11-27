import { describe, expect, it } from "vitest";
import {
  TAMANO_PALETA_CUENTAS,
  agruparPorDia,
  colorCuentaZoom,
  cuentasPresentes,
} from "../src/modules/reuniones/lista-zoom-agrupacion.domain";

describe("colorCuentaZoom", () => {
  it("define una paleta de al menos 10 colores", () => {
    expect(TAMANO_PALETA_CUENTAS).toBeGreaterThanOrEqual(10);
  });

  it("asigna índices distintos a sala01 y sala08 según NN-1 módulo el tamaño de la paleta", () => {
    const colorSala01 = colorCuentaZoom("sala01@flacso.edu.uy");
    const colorSala08 = colorCuentaZoom("sala08@flacso.edu.uy");

    expect(colorSala01).toBe(0);
    expect(colorSala08).toBe(7 % TAMANO_PALETA_CUENTAS);
    expect(colorSala01).not.toBe(colorSala08);
  });

  it("devuelve siempre el mismo índice para el mismo correo sin importar mayúsculas o espacios", () => {
    expect(colorCuentaZoom("sala02@flacso.edu.uy")).toBe(1);
    expect(colorCuentaZoom("SALA02@FLACSO.EDU.UY")).toBe(1);
    expect(colorCuentaZoom("  Sala02@flacso.edu.uy  ")).toBe(1);

    const correoEspecial = "Posgrados@flacso.edu.uy";
    expect(colorCuentaZoom(correoEspecial)).toBe(colorCuentaZoom("posgrados@flacso.edu.uy"));
  });

  it("devuelve null cuando no hay cuenta asignada", () => {
    expect(colorCuentaZoom(null)).toBeNull();
    expect(colorCuentaZoom(undefined)).toBeNull();
    expect(colorCuentaZoom("")).toBeNull();
    expect(colorCuentaZoom("   ")).toBeNull();
  });

  it("calcula un índice estable por hash para cuentas sin formato salaNN@ y mantiene todo índice en rango", () => {
    const muestras = [
      "sala01@flacso.edu.uy",
      "sala10@flacso.edu.uy",
      "sala15@flacso.edu.uy",
      "sala00@flacso.edu.uy",
      "zoom@flacso.edu.uy",
      "eventos@flacso.edu.uy",
      "academica@flacso.edu.uy",
      "Sala Principal",
    ];

    for (const cuenta of muestras) {
      const indice = colorCuentaZoom(cuenta);
      expect(indice).not.toBeNull();
      expect(Number.isInteger(indice)).toBe(true);
      expect(indice).toBeGreaterThanOrEqual(0);
      expect(indice).toBeLessThan(TAMANO_PALETA_CUENTAS);
      expect(colorCuentaZoom(cuenta)).toBe(indice);
    }
  });
});

describe("agruparPorDia", () => {
  it("ubica un encuentro a las 23:30 de Montevideo en su día local aunque en UTC ya sea el siguiente", () => {
    const ahora = new Date("2026-11-01T12:00:00-03:00");
    // 2026-11-04 23:30 en Montevideo (-03:00) equivale a 2026-11-05T02:30:00.000Z
    const encuentroNocturno = { id: "enc-1", inicio: new Date("2026-11-05T02:30:00.000Z") };

    const grupos = agruparPorDia([encuentroNocturno], (item) => item.inicio, ahora);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.clave).toBe("2026-11-04");
    expect(grupos[0]?.etiqueta).toBe("miércoles, 4 de noviembre");
    expect(grupos[0]?.relativo).toBeNull();
    expect(grupos[0]?.items).toEqual([encuentroNocturno]);
  });

  it("separa encuentros a las 23:30 y a las 00:30 locales de Montevideo en días distintos", () => {
    const ahora = new Date("2026-11-01T12:00:00-03:00");
    const noche = { id: "a", inicio: new Date("2026-11-05T02:30:00.000Z") }; // 23:30 del 4/11 MVD
    const madrugada = { id: "b", inicio: new Date("2026-11-05T03:30:00.000Z") }; // 00:30 del 5/11 MVD

    const grupos = agruparPorDia([noche, madrugada], (item) => item.inicio, ahora);

    expect(grupos.map((g) => g.clave)).toEqual(["2026-11-04", "2026-11-05"]);
    expect(grupos[0]?.etiqueta).toBe("miércoles, 4 de noviembre");
    expect(grupos[1]?.etiqueta).toBe("jueves, 5 de noviembre");
  });

  it("marca HOY y MANANA relativos a ahora en zona America/Montevideo", () => {
    // 23:45 del miércoles 4/11 en Montevideo (en UTC ya es 5/11 02:45Z)
    const ahora = new Date("2026-11-05T02:45:00.000Z");
    const items = [
      { id: "ayer", inicio: new Date("2026-11-03T14:00:00-03:00") },
      { id: "hoy", inicio: new Date("2026-11-04T20:00:00-03:00") },
      { id: "manana", inicio: new Date("2026-11-05T09:00:00-03:00") },
      { id: "pasado", inicio: new Date("2026-11-06T09:00:00-03:00") },
    ];

    const grupos = agruparPorDia(items, (item) => item.inicio, ahora);

    expect(grupos.map((g) => ({ clave: g.clave, relativo: g.relativo }))).toEqual([
      { clave: "2026-11-03", relativo: null },
      { clave: "2026-11-04", relativo: "HOY" },
      { clave: "2026-11-05", relativo: "MANANA" },
      { clave: "2026-11-06", relativo: null },
    ]);
  });

  it("conserva el orden de entrada y agrupa solo días consecutivos iguales sin mezclar no consecutivos", () => {
    const ahora = new Date("2026-11-04T12:00:00-03:00");
    const e1 = { id: "1", inicio: new Date("2026-11-04T10:00:00-03:00") };
    const e2 = { id: "2", inicio: new Date("2026-11-04T18:00:00-03:00") };
    const e3 = { id: "3", inicio: new Date("2026-11-05T11:00:00-03:00") };
    const e4 = { id: "4", inicio: new Date("2026-11-04T22:00:00-03:00") };

    const grupos = agruparPorDia([e1, e2, e3, e4], (item) => item.inicio, ahora);

    expect(grupos).toHaveLength(3);
    expect(grupos[0]?.clave).toBe("2026-11-04");
    expect(grupos[0]?.items).toEqual([e1, e2]);
    expect(grupos[1]?.clave).toBe("2026-11-05");
    expect(grupos[1]?.items).toEqual([e3]);
    expect(grupos[2]?.clave).toBe("2026-11-04");
    expect(grupos[2]?.items).toEqual([e4]);
  });
});

describe("cuentasPresentes", () => {
  it("devuelve cuentas únicas ordenadas por nombre local con su índice de color", () => {
    const entrada = [
      "sala08@flacso.edu.uy",
      null,
      "sala02@flacso.edu.uy",
      "SALA02@FLACSO.EDU.UY",
      undefined,
      "   ",
      "sala01@flacso.edu.uy",
      "eventos@flacso.edu.uy",
    ] as const;

    const resultado = cuentasPresentes(entrada);

    expect(resultado).toEqual([
      {
        correo: "eventos@flacso.edu.uy",
        nombre: "eventos",
        color: colorCuentaZoom("eventos@flacso.edu.uy"),
      },
      {
        correo: "sala01@flacso.edu.uy",
        nombre: "sala01",
        color: 0,
      },
      {
        correo: "sala02@flacso.edu.uy",
        nombre: "sala02",
        color: 1,
      },
      {
        correo: "sala08@flacso.edu.uy",
        nombre: "sala08",
        color: 7 % TAMANO_PALETA_CUENTAS,
      },
    ]);
  });
});
