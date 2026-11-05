import { describe, expect, it } from "vitest";
import {
  planificarSincronizacionGrupoZoom,
  type CuentaZoomActual,
  type MiembroGrupoZoom
} from "../src/modules/configuracion/zoom-grupo-sincronizacion.domain";

const miembro = (id: string, email: string): MiembroGrupoZoom => ({ id, email, nombre: `N ${id}`, licenciado: true });
const cuenta = (id: string, email: string | null, extra: Partial<CuentaZoomActual> = {}): CuentaZoomActual => ({
  id,
  emailOrganizador: email,
  externalAccountId: null,
  activa: true,
  fueraDelGrupoAt: null,
  prioridad: 100,
  ...extra
});

describe("zoom-grupo-sincronizacion.domain", () => {
  it("crea miembros nuevos con prioridad correlativa", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("a", "a@x.uy"), miembro("b", "b@x.uy")],
      [cuenta("c1", "z@x.uy", { prioridad: 120 })],
      {}
    );
    expect(plan.crear.map((c) => c.prioridad)).toEqual([121, 122]);
    expect(plan.crear.map((c) => c.miembro.id)).toEqual(["a", "b"]);
  });

  it("usa prioridad 100 si no hay cuentas y cuenta una vez los correos duplicados", () => {
    const plan = planificarSincronizacionGrupoZoom([miembro("a", "A@x.uy"), miembro("a2", " a@x.uy ")], [], {});
    expect(plan.crear).toHaveLength(1);
    expect(plan.crear[0].miembro.id).toBe("a");
    expect(plan.crear[0].prioridad).toBe(100);
  });

  it("adopta una cuenta existente por correo sin distinguir mayúsculas", () => {
    const plan = planificarSincronizacionGrupoZoom([miembro("a", "Ana@X.uy")], [cuenta("c1", " ana@x.uy")], {});
    expect(plan.crear).toHaveLength(0);
    expect(plan.actualizar).toEqual([{ cuentaId: "c1", miembro: miembro("a", "Ana@X.uy"), reactivar: false }]);
  });

  it("empareja por id de Zoom una cuenta cuyo correo cambió y la actualiza sin crear otra", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("u1", "nuevo@x.uy")],
      [cuenta("c1", "viejo@x.uy", { externalAccountId: "u1" })],
      {}
    );
    expect(plan.crear).toEqual([]);
    expect(plan.actualizar).toEqual([{ cuentaId: "c1", miembro: miembro("u1", "nuevo@x.uy"), reactivar: false }]);
    expect(plan.desactivar).toEqual([]);
    expect(plan.marcarFuera).toEqual([]);
  });

  it("adopta por correo una cuenta cargada a mano cuyo id externo es el correo", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("u1", "Sala01@x.uy")],
      [cuenta("c1", "sala01@x.uy", { externalAccountId: "sala01@x.uy" })],
      {}
    );
    expect(plan.crear).toEqual([]);
    expect(plan.actualizar).toEqual([{ cuentaId: "c1", miembro: miembro("u1", "Sala01@x.uy"), reactivar: false }]);
  });

  it("una cuenta emparejada por id no se empareja también por correo", () => {
    // u1 cambió su correo a nuevo@; su correo viejo (otro@) ahora es de u2.
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("u1", "nuevo@x.uy"), miembro("u2", "otro@x.uy")],
      [
        cuenta("c1", "otro@x.uy", { externalAccountId: "u1" }),
        cuenta("c2", "nuevo@x.uy", { externalAccountId: "nuevo@x.uy" })
      ],
      {}
    );
    expect(plan.actualizar).toEqual([{ cuentaId: "c1", miembro: miembro("u1", "nuevo@x.uy"), reactivar: false }]);
    expect(plan.crear).toEqual([{ miembro: miembro("u2", "otro@x.uy"), prioridad: 101 }]);
    expect(plan.desactivar).toEqual(["c2"]);
  });

  it("reactiva una cuenta que vuelve al grupo", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("a", "a@x.uy")],
      [cuenta("c1", "a@x.uy", { activa: false, fueraDelGrupoAt: new Date() })],
      {}
    );
    expect(plan.actualizar[0].reactivar).toBe(true);
  });

  it("reactiva una cuenta marcada fuera que vuelve al grupo", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("a", "a@x.uy")],
      [cuenta("c1", "a@x.uy", { fueraDelGrupoAt: new Date() })],
      {}
    );
    expect(plan.actualizar[0].reactivar).toBe(true);
  });

  it("no reactiva una cuenta del grupo que se desactivó a mano", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("a", "a@x.uy")],
      [cuenta("c1", "a@x.uy", { activa: false, fueraDelGrupoAt: null })],
      {}
    );
    expect(plan.actualizar).toEqual([{ cuentaId: "c1", miembro: miembro("a", "a@x.uy"), reactivar: false }]);
    expect(plan.desactivar).toEqual([]);
  });

  it("desactiva la que salió sin reuniones futuras", () => {
    const plan = planificarSincronizacionGrupoZoom([miembro("a", "a@x.uy")], [cuenta("c1", "b@x.uy")], {});
    expect(plan.desactivar).toEqual(["c1"]);
    expect(plan.marcarFuera).toEqual([]);
  });

  it("marca fuera del grupo la que salió con reuniones futuras y no la desactiva", () => {
    const plan = planificarSincronizacionGrupoZoom([miembro("a", "a@x.uy")], [cuenta("c1", "b@x.uy")], { c1: 3 });
    expect(plan.desactivar).toEqual([]);
    expect(plan.marcarFuera).toEqual([{ cuentaId: "c1", reunionesFuturas: 3 }]);
  });

  it("no repite una cuenta ya desactivada y fuera del grupo", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("a", "a@x.uy")],
      [cuenta("c1", "b@x.uy", { activa: false, fueraDelGrupoAt: new Date() })],
      {}
    );
    expect(plan.desactivar).toEqual([]);
    expect(plan.marcarFuera).toEqual([]);
  });

  it("mantiene en marcarFuera la ya marcada con reuniones futuras y desactiva la que quedó sin ellas", () => {
    const fuera = new Date();
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("a", "a@x.uy")],
      [cuenta("c1", "b@x.uy", { fueraDelGrupoAt: fuera }), cuenta("c2", "c@x.uy", { fueraDelGrupoAt: fuera })],
      { c1: 2 }
    );
    expect(plan.marcarFuera).toEqual([{ cuentaId: "c1", reunionesFuturas: 2 }]);
    expect(plan.desactivar).toEqual(["c2"]);
  });

  it("trata las cuentas sin correo como fuera del grupo y nunca las empareja por correo", () => {
    const plan = planificarSincronizacionGrupoZoom([miembro("a", "a@x.uy")], [cuenta("c1", null)], {});
    expect(plan.crear).toHaveLength(1);
    expect(plan.desactivar).toEqual(["c1"]);
  });

  it("el resumen cuenta nuevas, desactivadas y fuera del grupo", () => {
    const plan = planificarSincronizacionGrupoZoom(
      [miembro("a", "a@x.uy"), miembro("b", "b@x.uy")],
      [cuenta("c1", "o@x.uy"), cuenta("c2", "p@x.uy")],
      { c2: 1 }
    );
    expect(plan.resumen).toBe("2 nuevas, 1 desactivada, 1 fuera del grupo con reuniones");
  });
});
