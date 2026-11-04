import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AcademicDetails } from "../src/modules/reuniones/presentation/components/nueva-reunion/academic-details";
import { MeetingSummary } from "../src/modules/reuniones/presentation/components/nueva-reunion/meeting-summary";

import { MeetingScheduleEditor } from "../src/modules/reuniones/presentation/components/nueva-reunion/meeting-schedule-editor";

import { MeetingOptions } from "../src/modules/reuniones/presentation/components/nueva-reunion/meeting-options";

const sinCambios = () => {};
const resumen = { count: 1, isReady: false, hasProgram: true, academicReady: true, requiresAssistance: false, requiresRecording: false };

describe("datos académicos y resumen", () => {
  it("conserva campos, restricciones y etiquetas de cada programa y docente", () => {
    const html = renderToStaticMarkup(createElement(AcademicDetails, { programs: [{ id: "uno", label: "Programa uno", teacher: "Ana" }, { id: "dos", label: "Programa dos", teacher: "Luis" }], selectedProgramId: "uno", title: "Seminario", onTitleChange: sinCambios, onProgramChange: sinCambios }));
    expect(html).toMatch(/<input(?=[^>]*name="titulo")(?=[^>]*minLength="3")[^>]*>/);
    expect(html).toContain('name="docenteProgramaId"');
    expect(html).toContain('<option value="uno" selected="">Programa uno — Ana</option>');
    expect(html).toContain('<option value="dos">Programa dos — Luis</option>');
    expect(html.match(/<option/g)).toHaveLength(3);
    expect(html).toMatch(/<textarea[^>]*name="descripcion"/);
    expect(html).toContain('id="datos-academicos"');
  });
  it.each([
    [{ isReady: true }, "Listo para crear"],
    [{ hasProgram: false, academicReady: false }, "Elegí un programa"],
    [{ academicReady: false }, "Completá el título"],
    [{}, "Revisá fechas y horarios"]
  ])("comunica el estado del formulario: %s", (cambios, texto) => {
    const html = renderToStaticMarkup(createElement(MeetingSummary, { ...resumen, ...cambios }));
    expect(html).toContain(texto);
    expect(html).toContain('role="status" aria-live="polite"');
  });
  it("conserva singular, plural y las opciones del resumen", () => {
    const uno = renderToStaticMarkup(createElement(MeetingSummary, resumen));
    const dos = renderToStaticMarkup(createElement(MeetingSummary, { ...resumen, count: 2, requiresAssistance: true, requiresRecording: true }));
    expect(uno).toContain("1 encuentro");
    expect(uno).toContain("Sin monitoreo · Sin grabación");
    expect(dos).toContain("2 encuentros");
    expect(dos).toContain("Con monitoreo · Se graba");
  });
});

const fecha = { id: 1, fecha: "2026-11-10", horaInicio: "10:00", horaFin: "17:00", horaAsistenciaInicio: "09:30", horaAsistenciaFin: "17:30", descripcion: "" };
const recurrencia = { desde: "2026-11-10", hasta: "2026-11-20", diasSemana: [2], horaInicio: "10:00", horaFin: "17:00", horaAsistenciaInicio: "09:45", horaAsistenciaFin: "17:00" };

function renderizarFechas(cambios: Partial<Parameters<typeof MeetingScheduleEditor>[0]> = {}) {
  return renderToStaticMarkup(createElement(MeetingScheduleEditor, {
    dates: [fecha], dateMode: "SINGLE", requiresAssistance: false, meetingMode: "VIRTUAL", recurrence: recurrencia, message: "", recurrenceGenerated: false, recurrenceReviewRef: { current: null },
    onChange: sinCambios, onRecurrenceTimeChange: sinCambios, onGenerate: sinCambios, onFieldChange: sinCambios, onTimeChange: sinCambios, onRemove: sinCambios, onAdd: sinCambios, onModeChange: sinCambios,
    ...cambios
  }));
}

describe("editores de fechas", () => {
  it("muestra una sola fecha sin acciones de agregar ni quitar", () => {
    const html = renderizarFechas();
    expect(html.match(/class="date-row date-row-single"/g)).toHaveLength(1);
    expect(html).not.toContain("Quitar encuentro");
    expect(html).not.toContain("Agregar otra fecha");
    expect(html).toContain('class="date-mode-selector"');
  });
  it("numera las fechas manuales y permite agregar y quitar", () => {
    const html = renderizarFechas({ dateMode: "MANUAL", dates: [fecha, { ...fecha, id: 2 }] });
    expect(html.match(/class="date-row"/g)).toHaveLength(2);
    expect(html).toContain('class="date-row-number" aria-hidden="true">1');
    expect(html).toContain('class="date-row-number" aria-hidden="true">2');
    expect(html).toContain('title="Quitar encuentro 1"');
    expect(html).toContain('title="Quitar encuentro 2"');
    expect(html).toContain("Agregar otra fecha");
  });
  it("muestra los siete días de la recurrencia sin filas hasta generar", () => {
    const html = renderizarFechas({ dateMode: "RECURRENT" });
    for (const dia of ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]) expect(html).toContain(`<span>${dia}</span>`);
    expect(html.match(/type="checkbox"/g)).toHaveLength(7);
    expect(html).toContain("Generar vista previa");
    expect(html).not.toContain('class="date-row"');
    expect(html).not.toContain("Agregar encuentro a la serie");
  });
  it("muestra la revisión y las filas después de generar la serie", () => {
    const html = renderizarFechas({ dateMode: "RECURRENT", recurrenceGenerated: true });
    expect(html).toContain('class="date-row"');
    expect(html).toContain("2. Revisá y ajustá los encuentros");
    expect(html).toContain("Agregar encuentro a la serie");
  });
  it("permite editar la cobertura híbrida y calcula la virtual fija", () => {
    const hibrida = renderizarFechas({ requiresAssistance: true, meetingMode: "HIBRIDA" });
    expect(hibrida).toMatch(/Llegada del asistente<\/span><input type="time" required="" value="09:30"/);
    expect(hibrida).toMatch(/Salida del asistente<\/span><input type="time" required="" value="17:30"/);
    const virtual = renderizarFechas({ requiresAssistance: true });
    expect(virtual).toContain('class="meeting-assistance-fields is-virtual"');
    expect(virtual).toContain('Llegada del asistente</span><strong>09:45</strong>');
    expect(virtual).toContain('Salida del asistente</span><strong>17:00</strong>');
  });
  it("advierte la cobertura híbrida insuficiente en filas y en la regla", () => {
    const html = renderizarFechas({ requiresAssistance: true, meetingMode: "HIBRIDA", dates: [{ ...fecha, horaAsistenciaInicio: "09:45" }] });
    expect(html).toContain('role="alert">El asistente debe llegar al menos 30 minutos antes');
    const regla = renderizarFechas({ requiresAssistance: true, meetingMode: "HIBRIDA", dateMode: "RECURRENT" });
    expect(regla).toContain('role="alert">La llegada debe ser al menos 30 min antes');
  });
});

function renderizarOpciones(cambios: Partial<Parameters<typeof MeetingOptions>[0]> = {}) {
  return renderToStaticMarkup(createElement(MeetingOptions, { requiresAssistance: false, requiresRecording: false, meetingMode: "VIRTUAL", assistanceMode: "OPEN", canAssignAssistant: false, assistants: [], onRequiresAssistanceChange: sinCambios, onRequiresRecordingChange: sinCambios, onModeChange: sinCambios, onAssistanceModeChange: sinCambios, ...cambios }));
}

describe("opciones de monitoreo y grabación", () => {
  it("oculta modalidad y asignación cuando no hay asistencia", () => {
    const html = renderizarOpciones();
    expect(html).not.toContain('name="modalidad"');
    expect(html).not.toContain('name="modoAsistencia"');
    expect(html).not.toContain('name="asistenteTecnicoId"');
  });
  it("sin permiso ofrece postulaciones y oculta asignación directa", () => {
    const html = renderizarOpciones({ requiresAssistance: true, assistanceMode: "ASSIGN", assistants: [{ id: "uno", label: "Ana" }] });
    expect(html).toContain("Abierta a postulaciones");
    expect(html).toContain('name="modalidad"');
    expect(html).not.toContain('name="asistenteTecnicoId"');
    expect(html).not.toContain("Asignar ahora");
  });
  it("permite seleccionar entre los asistentes disponibles con permiso", () => {
    const html = renderizarOpciones({ requiresAssistance: true, canAssignAssistant: true, assistanceMode: "ASSIGN", assistants: [{ id: "uno", label: "Ana" }, { id: "dos", label: "Luis" }] });
    expect(html).toMatch(/<select[^>]*name="asistenteTecnicoId"/);
    expect(html).toContain('<option value="uno">Ana</option>');
    expect(html).toContain('<option value="dos">Luis</option>');
    expect(html.match(/<option/g)).toHaveLength(3);
  });
  it("deshabilita asignar ahora cuando no hay asistentes", () => {
    const html = renderizarOpciones({ requiresAssistance: true, canAssignAssistant: true });
    expect(html).toMatch(/<input(?=[^>]*value="ASSIGN")(?=[^>]*disabled="")[^>]*>/);
    expect(html).toContain("No hay asistentes disponibles");
  });
  it.each([false, true])("refleja los radios de monitoreo y grabación: %s", (valor) => {
    const html = renderizarOpciones({ requiresAssistance: valor, requiresRecording: valor });
    for (const nombre of ["requiereAsistenciaTecnica", "requiereGrabacion"]) {
      const radios = html.match(new RegExp(`<input[^>]*name="${nombre}"[^>]*>`, "g"))!;
      expect(radios).toHaveLength(2);
      expect(radios[0].includes('checked=""')).toBe(!valor);
      expect(radios[1].includes('checked=""')).toBe(valor);
    }
  });
});
