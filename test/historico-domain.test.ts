import { describe, expect, it } from "vitest";
import { puedeVerHistoricoZoom } from "../src/modules/historico/api";

describe("alcance funcional del histórico", () => {
  it("reserva el histórico Zoom a Administración", () => {
    expect(puedeVerHistoricoZoom("ADMINISTRACION")).toBe(true);
    expect(puedeVerHistoricoZoom("DOCENTE")).toBe(false);
    expect(puedeVerHistoricoZoom("ASISTENTE_TECNICO")).toBe(false);
  });
});
