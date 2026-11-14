import { describe, expect, it, vi } from "vitest";
import {
  nombreCarpetaOcurrenciaZoom,
  resolverCarpetaDestinoZoom
} from "../src/modules/archivos/application/resolver-carpeta-zoom";

const hash = (t: string) => `H(${t})`;
const archivo = (vinculado: boolean) =>
  ({
    eventoProveedorId: vinculado ? "e1" : null,
    ocurrencia: {
      cuentaZoomId: "acct",
      uuid: "AbC/uuid==",
      titulo: "Clase / Género: 1",
      inicioRealAt: new Date("2026-11-09T02:30:00Z")
    }
  }) as never;

describe("nombreCarpetaOcurrenciaZoom", () => {
  it("sanea separadores y caracteres de control, acota el largo e incluye fecha local y sufijo del UUID", () => {
    const n = nombreCarpetaOcurrenciaZoom({
      titulo: "Clase / Género:\n1 " + "x".repeat(300),
      uuid: "AbC/uuid==",
      inicioRealAt: new Date("2026-11-09T02:30:00Z")
    });
    expect(n).not.toMatch(/[/\\\n]/);
    expect(n.length).toBeLessThanOrEqual(140);
    // 02:30Z del 9/11 es el 8/11 a las 23:30 en Montevideo.
    expect(n).toContain("2026-11-08");
    expect(n.endsWith("]")).toBe(true);
  });
});

describe("resolverCarpetaDestinoZoom", () => {
  const storage = () => {
    const asegurarCarpeta = vi.fn(async (_c: string, nombre: string, padre: string) => `${padre}>${nombre}`);
    return { asegurarCarpeta } as never;
  };

  it("encuentro vinculado: carpeta de la ocurrencia directamente bajo la raíz de grabaciones, sin AAAA/MM", async () => {
    const s = storage();
    const id = await resolverCarpetaDestinoZoom(s, hash, archivo(true), {
      raizVinculados: "RAIZ",
      raizHistorico: "ADMIN"
    });
    expect(id!.startsWith("RAIZ>")).toBe(true);
    expect(id).not.toContain("RAIZ>2026");
    expect(
      (s as never as { asegurarCarpeta: ReturnType<typeof vi.fn> }).asegurarCarpeta
    ).toHaveBeenCalledTimes(1);
  });

  it("histórico sin vincular: solo bajo la carpeta de administración, nunca bajo la raíz legible por docentes", async () => {
    const id = await resolverCarpetaDestinoZoom(storage(), hash, archivo(false), {
      raizVinculados: "RAIZ",
      raizHistorico: "ADMIN"
    });
    expect(id!.startsWith("ADMIN>2026>11>")).toBe(true);
    expect(id).not.toContain("RAIZ");
  });

  it("sin carpeta de administración configurada no usa la raíz de docentes como respaldo", async () => {
    const s = storage();
    expect(
      await resolverCarpetaDestinoZoom(s, hash, archivo(false), {
        raizVinculados: "RAIZ",
        raizHistorico: null
      })
    ).toBeNull();
    expect(
      (s as never as { asegurarCarpeta: ReturnType<typeof vi.fn> }).asegurarCarpeta
    ).not.toHaveBeenCalled();
  });

  it("vinculado sin raíz de grabaciones configurada devuelve null", async () => {
    expect(
      await resolverCarpetaDestinoZoom(storage(), hash, archivo(true), {
        raizVinculados: null,
        raizHistorico: "ADMIN"
      })
    ).toBeNull();
  });

  it("la clave de identidad de la carpeta es propia de cada ocurrencia", async () => {
    const claves: string[] = [];
    const s = {
      asegurarCarpeta: vi.fn(async (c: string, _n: string, p: string) => {
        claves.push(c);
        return `${p}/x`;
      })
    } as never;
    await resolverCarpetaDestinoZoom(s, hash, archivo(true), { raizVinculados: "RAIZ", raizHistorico: null });
    const otra = {
      ...(archivo(true) as object),
      ocurrencia: { ...(archivo(true) as { ocurrencia: object }).ocurrencia, uuid: "otro" }
    } as never;
    const claves2: string[] = [];
    const s2 = {
      asegurarCarpeta: vi.fn(async (c: string, _n: string, p: string) => {
        claves2.push(c);
        return `${p}/x`;
      })
    } as never;
    await resolverCarpetaDestinoZoom(s2, hash, otra, { raizVinculados: "RAIZ", raizHistorico: null });
    expect(claves).toHaveLength(1);
    expect(claves[0]).not.toBe(claves2[0]); // la carpeta de la ocurrencia es propia
  });
});
