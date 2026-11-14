import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonitoringSummary } from "../src/modules/asistencia/presentation/components/monitoring-summary";

describe("resumen de monitoreo", () => {
  it("muestra totales y enlaza a las pendientes", () => {
    const html = renderToStaticMarkup(<MonitoringSummary total={10} covered={9} pending={1} />);
    expect(html).toContain("10 reuniones");
    expect(html).toContain("9 cubiertas");
    expect(html).toContain("1 pendiente");
    expect(html).toContain('href="/monitoreo?estado=pendientes"');
  });

  it("sin pendientes no hay enlace ni alerta", () => {
    const html = renderToStaticMarkup(<MonitoringSummary total={3} covered={3} pending={0} />);
    expect(html).toContain("0 pendientes");
    expect(html).not.toContain("estado=pendientes");
    expect(html).not.toContain("is-alert");
  });

  it("usa singular con una reunión", () => {
    const html = renderToStaticMarkup(<MonitoringSummary total={1} covered={0} pending={1} />);
    expect(html).toContain("1 reunión");
    expect(html).not.toContain("1 reuniones");
  });

  it("conserva la búsqueda en el enlace", () => {
    const html = renderToStaticMarkup(<MonitoringSummary total={2} covered={1} pending={1} q="china" />);
    expect(html).toContain("/monitoreo?estado=pendientes&amp;q=china");
  });
});
