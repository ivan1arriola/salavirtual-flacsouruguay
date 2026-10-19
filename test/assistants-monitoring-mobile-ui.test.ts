import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../src/bootstrap/ui/asistencia/asistentes-page.server.tsx", import.meta.url),
  "utf8"
);
const css = readFileSync(
  new URL("../app/(gestion)/assistants-monitoring-mobile.css", import.meta.url),
  "utf8"
);

describe("directorio de asistentes de monitoreo responsive", () => {
  it("preserva la autorización administrativa y las consultas existentes", () => {
    expect(page).toContain('session?.user.role !== "ADMINISTRACION"');
    expect(page).toContain("obtenerResumenAsistentes(db, period)");
    expect(page).toContain("obtenerResumenAsistentes");
    expect(page).toContain("futureByAssistant");
    expect(page).toContain("assistantStatusLabel(status)");
    expect(page).toContain('href={detailHref}');
  });

  it("muestra métricas reales sin estimar tendencias inexistentes", () => {
    expect(page).toContain("{operationalCount}");
    expect(page).toContain("{totals.reuniones}");
    expect(page).toContain("{formatMinutes(totals.minutos)}");
    expect(page).toContain("{formatAmounts(totals.montos)}");
    expect(page).not.toContain("+12%");
    expect(page).not.toContain("finalizadas ·");
  });

  it("mantiene la descarga del reporte del mes anterior sin cambiar su contrato", () => {
    expect(page).toContain("periodoMesAnteriorUtc3(new Date())");
    expect(page).toContain('href="/api/v1/asistencia/planilla-pagos"');
    expect(page).toContain("{etiquetaMes(paymentPeriod.clave)}");
  });

  it("filtra, busca y ordena con parámetros GET sin perder el período", () => {
    expect(page).toContain('name="mes" type="hidden" value={period.clave}');
    expect(page).toContain('placeholder="Buscar por nombre o correo"');
    expect(page).toContain('<option value="inactivos">Inactivos</option>');
    expect(page).toContain('name="orden"');
    expect(page).toContain('new URLSearchParams({ mes: period.clave, estado: value })');
    expect(page).toContain('params.set("q", query.q.trim())');
    expect(page).toContain("sortedVisibleAssistants");
    expect(page).toContain('orden === "proximas"');
    expect(page).toContain('orden === "horas"');
  });

  it("renderiza tarjetas con estados, modalidades y enlace táctil al detalle", () => {
    expect(page).toContain('className="assistant-monitor-card"');
    expect(page).toContain('className="assistant-monitor-card-metrics"');
    expect(page).toContain('aria-label={`Ver detalle de ${assistant.nombre}`}');
    expect(page).toContain("{assistant.virtuales} virtuales · {assistant.hibridas} híbridas");
    expect(page).toContain("{assistantStatusLabel(status)}");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 360px)");
  });

  it("limita el rediseño a la pantalla administrativa", () => {
    const layout = readFileSync(new URL("../app/(gestion)/layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain('import "./assistants-monitoring-mobile.css"');
    expect(css).toContain(".assistants-directory .assistant-monitor-card");
    expect(css).not.toContain(".assistant-dashboard .assistant-monitor-card");
  });
});
