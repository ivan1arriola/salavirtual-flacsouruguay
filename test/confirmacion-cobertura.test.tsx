import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmacionCobertura } from "../src/modules/asistencia/presentation/components/confirmacion-cobertura";

describe("confirmación de cobertura", () => {
  it("explica el alcance de una convocatoria abierta", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmacionCobertura, {
        detalle: { tipo: "convocatoria" },
        onCerrar: vi.fn(),
        onConfirmar: vi.fn()
      })
    );
    expect(html).toContain("asistentes disponibles");
    expect(html).toContain("Agenda abierta");
    expect(html).toContain("Abrir convocatoria");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("<dialog");
  });

  it("identifica la persona y las consecuencias de aprobar un registro", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmacionCobertura, {
        detalle: {
          tipo: "aprobacion",
          nombre: "Ana Pérez",
          minutos: 90,
          moneda: "UYU",
          importe: "500,00",
          registroId: "r1"
        },
        onCerrar: vi.fn(),
        onConfirmar: vi.fn()
      })
    );
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("90 minutos");
    expect(html).toContain("UYU 500,00");
    expect(html).toContain("liquidaciones");
    expect(html).toContain("Volver");
  });
});
