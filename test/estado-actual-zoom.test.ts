import { describe, expect, it } from "vitest";
import {
  resolverEstadoActualZoom,
  type EjecucionZoomObservada
} from "../src/modules/reuniones/presentation/estado-actual-zoom";

const primera: EjecucionZoomObservada = {
  cuentaZoomId: "cuenta",
  uuid: "primera",
  inicio: new Date("2026-11-25T21:07:00Z"),
  fin: new Date("2026-11-25T21:11:00Z"),
  inicioConfirmado: true
};
const segunda: EjecucionZoomObservada = {
  ...primera,
  uuid: "segunda",
  inicio: new Date("2026-11-25T21:11:00Z"),
  fin: null
};

describe("estado actual de Zoom", () => {
  it("reconoce una nueva ejecución aunque la primera haya finalizado", () => {
    expect(
      resolverEstadoActualZoom(
        [primera, segunda],
        { estado: "started", uuid: "segunda", salaEspera: true },
        "cuenta"
      )
    ).toMatchObject({ tipo: "ACTIVA", ejecucion: segunda, fuente: "API" });
  });

  it("no asigna una ejecución de la serie sin UUID vinculado", () => {
    expect(
      resolverEstadoActualZoom(
        [primera],
        { estado: "started", uuid: "otra", salaEspera: null },
        "cuenta"
      )
    ).toMatchObject({ tipo: "OTRA_EJECUCION", ejecucion: null });
  });

  it("no mezcla cuentas y distingue API fallida de reunión cerrada", () => {
    const api = { estado: "started", uuid: "segunda", salaEspera: null } as const;
    expect(resolverEstadoActualZoom([segunda], api, "otra")).toMatchObject({
      tipo: "OTRA_EJECUCION"
    });
    expect(resolverEstadoActualZoom([segunda, primera], null, null)).toMatchObject({
      tipo: "INICIO_SIN_VERIFICAR",
      ejecucion: segunda
    });
    expect(
      resolverEstadoActualZoom(
        [segunda],
        { estado: "waiting", uuid: "segunda", salaEspera: null },
        "cuenta"
      )
    ).toMatchObject({ tipo: "SIN_ACTIVA" });
  });

  it(
    "no reactiva una ejecución por un aviso viejo sin cierre si existe otra posterior cerrada",
    () => {
      expect(
        resolverEstadoActualZoom(
          [{ ...primera, fin: null }, { ...segunda, fin: primera.fin }],
          null,
          null
        )
      ).toMatchObject({ tipo: "SIN_VERIFICAR" });
    }
  );
});
