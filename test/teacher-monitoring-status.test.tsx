import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeacherMonitoringStatus } from "../src/components/dashboard/teacher/teacher-monitoring-status";

const asignacion = {
  estado: "ASIGNADO",
  asistenteTecnico: { usuario: { nombres: "Ana", apellidos: "Pérez" } }
};

describe("monitoreo visible para docentes", () => {
  it.each(["ASIGNADO", "ACEPTADO"])("muestra el nombre con estado %s", (estado) => {
    const html = renderToStaticMarkup(
      <TeacherMonitoringStatus requiereMonitoreo asignaciones={[{ ...asignacion, estado }]} />
    );
    expect(html).toContain("Monitoreo técnico");
    expect(html).toContain("Ana Pérez");
    expect(html).toContain('data-state="asignado"');
  });

  it.each(["CANCELADO", "RECHAZADO"])("no expone una asignación %s", (estado) => {
    const html = renderToStaticMarkup(
      <TeacherMonitoringStatus requiereMonitoreo asignaciones={[{ ...asignacion, estado }]} />
    );
    expect(html).toContain("Pendiente de asignación");
    expect(html).not.toContain("Ana Pérez");
  });

  it("muestra pendiente cuando se desasigna a la persona", () => {
    const html = renderToStaticMarkup(<TeacherMonitoringStatus requiereMonitoreo asignaciones={[]} />);
    expect(html).toContain("Pendiente de asignación");
  });

  it("distingue una clase que no requiere monitoreo", () => {
    const html = renderToStaticMarkup(
      <TeacherMonitoringStatus requiereMonitoreo={false} asignaciones={[asignacion]} />
    );
    expect(html).toContain("No requiere monitoreo");
    expect(html).not.toContain("Ana Pérez");
  });

  it("no presenta una cobertura histórica sin registro como una tarea pendiente", () => {
    const html = renderToStaticMarkup(
      <TeacherMonitoringStatus requiereMonitoreo asignaciones={[]} historico />
    );
    expect(html).toContain("Sin asignación registrada");
  });

  it("identifica por separado el monitoreo de distintos encuentros", () => {
    const html = renderToStaticMarkup(
      <dl>
        <TeacherMonitoringStatus requiereMonitoreo asignaciones={[asignacion]} />
        <TeacherMonitoringStatus
          requiereMonitoreo
          asignaciones={[
            { ...asignacion, asistenteTecnico: { usuario: { nombres: "Luis", apellidos: null } } }
          ]}
        />
        <TeacherMonitoringStatus requiereMonitoreo asignaciones={[]} />
      </dl>
    );
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("Luis");
    expect(html).toContain("Pendiente de asignación");
  });

  it("consulta asignaciones activas en Mis clases y las muestra por encuentro", () => {
    const page = readFileSync("app/(gestion)/mis-clases/page.tsx", "utf8");
    expect(page).toContain('where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } }');
    expect(page).toContain("requiereAsistenciaTecnica: true");
    expect(page).toContain("asignaciones={clase.asignaciones}");
    expect(page).toContain("requiereMonitoreo={clase.requiereAsistenciaTecnica}");
    expect(page.indexOf("<TeacherMonitoringStatus")).toBeLessThan(page.indexOf("<details"));
  });
});
