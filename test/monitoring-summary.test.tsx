import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonitoringSummary } from "../src/modules/asistencia/presentation/components/monitoring-summary";

describe("resumen de monitoreo", () => {
  it("muestra los cuatro indicadores y el porcentaje de cobertura", () => {
    const html = renderToStaticMarkup(
      <MonitoringSummary total={10} covered={9} pending={1} applicantsCount={3} />
    );
    expect(html).toContain("Reuniones próximas");
    expect(html).toContain("Con cobertura");
    expect(html).toContain("Sin asignar");
    expect(html).toContain("Personas postuladas");
    expect(html).toContain(">10<");
    expect(html).toContain(">9<");
    expect(html).toContain(">1<");
    expect(html).toContain(">3<");
    expect(html).toContain("90%");
    expect(html).toContain('href="/monitoreo?estado=pendientes"');
  });

  it("sin pendientes no muestra enlace ni estado de alerta", () => {
    const html = renderToStaticMarkup(<MonitoringSummary total={3} covered={3} pending={0} />);
    expect(html).toContain("0");
    expect(html).not.toContain("estado=pendientes");
    expect(html).not.toContain("is-alert");
    expect(html).toContain("100%");
  });

  it("conserva la búsqueda en el enlace de pendientes", () => {
    const html = renderToStaticMarkup(
      <MonitoringSummary total={2} covered={1} pending={1} q="china" />
    );
    expect(html).toContain("/monitoreo?estado=pendientes&amp;q=china");
  });

  it("muestra cero cobertura cuando todavía no hay reuniones", () => {
    const html = renderToStaticMarkup(<MonitoringSummary total={0} covered={0} pending={0} />);
    expect(html).toContain("0%");
    expect(html).toContain("0 de 0 reuniones cubiertas");
  });
});
