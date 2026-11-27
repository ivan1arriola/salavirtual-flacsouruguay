import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ManagementCoverageRow } from "../src/modules/asistencia/presentation/components/management-coverage-row";

const base = {
  id: "meeting-1",
  title: "Seminario",
  platform: "Zoom" as const,
  modality: "VIRTUAL" as const,
  schedule: "10:00–12:00",
  classSchedule: "10:00–12:00",
  applicantsCount: 1
};

describe("fila de gestión de monitoreo", () => {
  it("prioriza visualmente el estado pendiente y ofrece asignar", () => {
    const html = renderToStaticMarkup(<ManagementCoverageRow data={{ ...base, assistantName: null }} />);
    expect(html).toContain("is-pending");
    expect(html).toContain("Pendiente de monitoreo");
    expect(html).toContain("1 postulación");
    expect(html).toContain("Asignar: Seminario");
    expect(html).toContain("/monitoreo/gestionar/meeting-1");
    expect(html).not.toContain("status-ok");
  });

  it("identifica al responsable de una cobertura asignada", () => {
    const html = renderToStaticMarkup(
      <ManagementCoverageRow data={{ ...base, assistantName: "Ana Pérez", applicantsCount: 2 }} />
    );
    expect(html).toContain("is-covered");
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("2 postulaciones");
    expect(html).toContain("Gestionar: Seminario");
  });

  it("distingue el horario de clase del horario técnico", () => {
    const html = renderToStaticMarkup(
      <ManagementCoverageRow
        data={{ ...base, assistantName: null, modality: "HIBRIDA", schedule: "09:45–12:15" }}
      />
    );
    expect(html).toContain("Híbrida");
    expect(html).toContain("09:45–12:15");
    expect(html).toContain("Horario de clase: 10:00–12:00");
  });
});
