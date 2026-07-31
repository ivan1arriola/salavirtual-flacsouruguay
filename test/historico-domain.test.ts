import { describe, expect, it } from "vitest";
import {
  obtenerAlcanceHistorico,
  obtenerTituloHistorico
} from "../src/modules/historico/historico.domain";

describe("alcance funcional del histórico", () => {
  it("entrega el histórico completo solo a Administracion", () => {
    expect(obtenerAlcanceHistorico("ADMINISTRACION")).toBe("COMPLETO");
    expect(obtenerAlcanceHistorico("DOCENTE")).toBe("PROGRAMAS_DOCENTE");
    expect(obtenerAlcanceHistorico("ASISTENTE")).toBe("ASIGNACIONES_ASISTENTE");
  });

  it("nombra el histórico del asistente en primera persona", () => {
    expect(obtenerTituloHistorico("ASIGNACIONES_ASISTENTE")).toBe("Mi histórico");
    expect(obtenerTituloHistorico("PROGRAMAS_DOCENTE")).toBe("Histórico Zoom");
    expect(obtenerTituloHistorico("COMPLETO")).toBe("Histórico Zoom");
  });
});
