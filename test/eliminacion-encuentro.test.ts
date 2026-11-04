import { describe, expect, it } from "vitest";
import { planEliminacionEncuentro } from "../src/modules/reuniones/eliminacion-encuentro.domain";

const base = { editable: true, ocupado: false, encuentrosEnSolicitud: 3, encuentrosEnPagina: 13 };

describe("planEliminacionEncuentro", () => {
  it("un encuentro de una solicitud con varios se elimina como encuentro", () => {
    expect(planEliminacionEncuentro(base)).toEqual({ modo: "ENCUENTRO", habilitado: true });
  });

  it("un encuentro que es el único de su solicitud, dentro de una serie con otros, cancela esa solicitud", () => {
    expect(planEliminacionEncuentro({ ...base, encuentrosEnSolicitud: 1 })).toEqual({ modo: "SOLICITUD", habilitado: true });
  });

  it("el único encuentro de la única solicitud se elimina con la serie completa", () => {
    const plan = planEliminacionEncuentro({ ...base, encuentrosEnSolicitud: 1, encuentrosEnPagina: 1 });
    expect(plan).toMatchObject({ modo: null, habilitado: false });
    expect(plan.motivo).toMatch(/Eliminar serie/);
  });

  it.each([
    ["no es editable", { editable: false }],
    ["hay otra operación en curso", { ocupado: true }],
  ])("se deshabilita cuando %s, sin cambiar el modo", (_motivo, cambio) => {
    expect(planEliminacionEncuentro({ ...base, ...cambio })).toMatchObject({ habilitado: false });
    expect(planEliminacionEncuentro({ ...base, encuentrosEnSolicitud: 1, ...cambio })).toMatchObject({ habilitado: false });
  });
});
