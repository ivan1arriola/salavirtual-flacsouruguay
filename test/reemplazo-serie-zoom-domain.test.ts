import { describe, expect, it } from "vitest";
import {
  planificarReemplazoSerieZoom,
  type EncuentroParaReemplazo,
} from "../src/modules/reuniones/reemplazo-serie-zoom.domain";

const fecha = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T12:00:00Z`);
const encuentro = (
  id: string,
  dia: number,
  extra: Partial<EncuentroParaReemplazo> = {},
): EncuentroParaReemplazo => ({
  id,
  estado: "PROGRAMADA",
  proveedor: "ZOOM",
  inicio: fecha(dia),
  fin: new Date(fecha(dia).getTime() + 60 * 60_000),
  ...extra,
});

describe("reemplazo de una serie con una nueva serie Zoom", () => {
  it("solo replica futuros y conserva pasado, cancelados y en curso", () => {
    const plan = planificarReemplazoSerieZoom(
      [
        encuentro("pasado", 2, { proveedor: "GOOGLE_MEET" }),
        encuentro("futuro-meet", 10, { proveedor: "GOOGLE_MEET" }),
        encuentro("futuro-zoom", 15),
        encuentro("cancelado", 17, { estado: "CANCELADA" }),
        encuentro("en-curso", 12, { estado: "EN_CURSO" }),
      ],
      fecha(5),
    );
    expect(plan.estado).toBe("PREPARABLE");
    expect(plan.copiar.map(({ id }) => id)).toEqual(["futuro-meet", "futuro-zoom"]);
    expect(plan.cancelarDespuesDeVerificar).toEqual(["futuro-meet", "futuro-zoom"]);
    expect(plan.conservar).toEqual(["pasado", "cancelado", "en-curso"]);
  });

  it("no propone nuevas reuniones cuando todo es histórico", () => {
    const plan = planificarReemplazoSerieZoom([encuentro("pasado", 2)], fecha(5));
    expect(plan.estado).toBe("NO_FUTUROS");
    expect(plan.cancelarDespuesDeVerificar).toEqual([]);
  });

  it("bloquea el reemplazo ante liquidaciones futuras o estados desconocidos", () => {
    const plan = planificarReemplazoSerieZoom(
      [
        encuentro("liquidado", 10, { tieneLiquidacion: true }),
        encuentro("desconocido", 11, { estado: "OTRO" }),
      ],
      fecha(5),
    );
    expect(plan.estado).toBe("REVISAR");
    expect(plan.copiar).toEqual([]);
    expect(plan.cancelarDespuesDeVerificar).toEqual([]);
    expect(plan.errores).toHaveLength(2);
  });

  it("bloquea fechas duplicadas o superpuestas", () => {
    const p = planificarReemplazoSerieZoom(
      [
        encuentro("a", 10),
        encuentro("b", 10, { fin: new Date(fecha(10).getTime() + 2 * 60 * 60_000) }),
      ],
      fecha(5),
    );
    expect(p.estado).toBe("REVISAR");
    expect(p.cancelarDespuesDeVerificar).toEqual([]);
  });

  it("no cancela un encuentro ya comenzado aunque su fin sea futuro", () => {
    const plan = planificarReemplazoSerieZoom(
      [encuentro("empezado", 5, { fin: fecha(6) }), encuentro("futuro", 10)],
      new Date(fecha(5).getTime() + 10 * 60_000),
    );
    expect(plan.conservar).toContain("empezado");
    expect(plan.cancelarDespuesDeVerificar).toEqual(["futuro"]);
  });
});
