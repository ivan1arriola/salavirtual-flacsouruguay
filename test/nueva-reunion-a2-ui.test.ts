import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingTypeSelector } from "../src/modules/reuniones/presentation/components/nueva-reunion/meeting-type-selector";
import { MeetingScheduleEditor } from "../src/modules/reuniones/presentation/components/nueva-reunion/meeting-schedule-editor";
import { MeetingSummary } from "../src/modules/reuniones/presentation/components/nueva-reunion/meeting-summary";
import { AcademicDetails } from "../src/modules/reuniones/presentation/components/nueva-reunion/academic-details";
import { MeetingFormZoom } from "../src/modules/reuniones/presentation/components/meeting-form-zoom";
import { MeetingInstancesEditor } from "../src/modules/reuniones/presentation/components/nueva-reunion/meeting-instances-editor";

const noop = () => {};
const fecha = {
  id: 5,
  fecha: "2026-11-10",
  horaInicio: "23:00",
  horaFin: "23:45",
  horaAsistenciaInicio: "22:30",
  horaAsistenciaFin: "00:15",
  descripcion: "",
};
const recurrence = {
  desde: "",
  hasta: "",
  diasSemana: [],
  horaInicio: "",
  horaFin: "",
  horaAsistenciaInicio: "",
  horaAsistenciaFin: "",
};
const program = { id: "uno", label: "Educación", teacher: "Ana Pérez" };

function editor(cambios: Partial<Parameters<typeof MeetingScheduleEditor>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(MeetingScheduleEditor, {
      dates: [fecha],
      dateMode: "SINGLE",
      requiresAssistance: false,
      meetingMode: "VIRTUAL",
      recurrence,
      message: "",
      recurrenceGenerated: false,
      recurrenceReviewRef: { current: null },
      onModeChange: noop,
      onChange: noop,
      onRecurrenceTimeChange: noop,
      onGenerate: noop,
      onFieldChange: noop,
      onTimeChange: noop,
      onRemove: noop,
      onAdd: noop,
      onDuplicate: noop,
      onSort: noop,
      ...cambios,
    }),
  );
}
function resumen(cambios: Partial<Parameters<typeof MeetingSummary>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(MeetingSummary, {
      dates: [fecha],
      dateMode: "SINGLE",
      selectedProgram: program,
      isReady: true,
      academicReady: true,
      requiresAssistance: false,
      requiresRecording: false,
      meetingMode: "VIRTUAL",
      canAssignAssistant: false,
      assistanceMode: "OPEN",
      selectedAssistant: undefined,
      ...cambios,
    }),
  );
}

describe("A2: tipo y modos", () => {
  it.each(["SINGLE", "RECURRENT", "MANUAL"] as const)(
    "ofrece exactamente dos tarjetas radio accesibles en %s",
    (dateMode) => {
      const html = renderToStaticMarkup(
        createElement(MeetingTypeSelector, {
          dateMode,
          onModeChange: noop,
          pendingMode: null,
          onConfirm: noop,
          onCancel: noop,
        }),
      );
      expect(html).toContain("<fieldset");
      expect(html).toContain("<legend>Tipo de reunión</legend>");
      expect(html.match(/type="radio"/g)).toHaveLength(2);
      expect(html).toContain("Reunión única");
      expect(html).toContain("Serie de encuentros");
      expect(html).toMatch(
        new RegExp(
          `<input(?=[^>]*value="${dateMode === "SINGLE" ? "SINGLE" : "SERIES"}")(?=[^>]*checked="")[^>]*>`,
        ),
      );
    },
  );
  it("la confirmación en línea explica la pérdida, ofrece cancelar y no cambia el radio seleccionado", () => {
    const html = renderToStaticMarkup(
      createElement(MeetingTypeSelector, {
        dateMode: "MANUAL",
        onModeChange: noop,
        pendingMode: "SINGLE",
        onConfirm: noop,
        onCancel: noop,
      }),
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Confirmar cambio");
    expect(html).toContain("Conservar y seguir editando");
    expect(html).toContain("primer encuentro cronológico");
    expect(html).toMatch(/<input(?=[^>]*value="SERIES")(?=[^>]*checked="")[^>]*>/);
  });
  it("única no expone modos de serie ni acciones de filas múltiples", () => {
    const html = editor();
    expect(html).not.toContain('name="dateMode"');
    expect(html).not.toContain("Duplicar encuentro");
    expect(html).not.toContain("Agregar otra fecha");
    expect(html.match(/class="date-row date-row-single"/g)).toHaveLength(1);
  });
  it("serie ofrece dos modos, muestra contador y conserva el orden de edición sin reordenar en vivo", () => {
    const html = editor({
      dateMode: "MANUAL",
      dates: [fecha, { ...fecha, id: 8, fecha: "2026-11-09" }],
    });
    expect(html.match(/name="dateMode"/g)).toHaveLength(2);
    expect(html).toContain("2 encuentros");
    expect(html.indexOf('value="2026-11-10"')).toBeLessThan(html.indexOf('value="2026-11-09"'));
    expect(html).toContain("Ordenar por fecha y hora");
    expect(html).toContain("Duplicar encuentro 1");
    expect(html).toContain("Quitar encuentro 2");
  });
  it("editar, duplicar y quitar apuntan a la posición de la fila que se ve", () => {
    const llamadas: unknown[][] = [];
    const tree = MeetingInstancesEditor({
      dates: [fecha, { ...fecha, id: 8, fecha: "2026-11-09" }],
      dateMode: "MANUAL",
      requiresAssistance: false,
      meetingMode: "VIRTUAL",
      onFieldChange: (...args) => llamadas.push(args),
      onTimeChange: noop,
      onAdd: noop,
      onRemove: (index) => llamadas.push(["quitar", index]),
      onDuplicate: (index) => llamadas.push(["duplicar", index]),
    });
    const nodos = elementos(tree);
    const primeraFecha = nodos.find((n) => n.type === "input" && n.props["type"] === "date")!;
    (primeraFecha.props["onChange"] as (event: { target: { value: string } }) => void)({
      target: { value: "2026-11-08" },
    });
    const duplicar = nodos.find((n) => n.props["aria-label"] === "Duplicar encuentro 1")!;
    const quitar = nodos.find((n) => n.props["aria-label"] === "Quitar encuentro 1")!;
    (duplicar.props["onClick"] as () => void)();
    (quitar.props["onClick"] as () => void)();
    expect(llamadas).toEqual([
      [0, "fecha", "2026-11-08"],
      ["duplicar", 0],
      ["quitar", 0],
    ]);
  });
  it("advierte solapamientos sin invalidar campos ni bloquear acciones", () => {
    const html = editor({ dateMode: "MANUAL", dates: [fecha, { ...fecha, id: 6 }] });
    expect(html).toContain("Hay encuentros que se solapan");
    expect(html).toContain("Podés continuar");
    expect(html).not.toContain('aria-invalid="true"');
  });
  it("al llegar a 100 permite quitar pero no agregar ni duplicar", () => {
    const html = editor({
      dateMode: "MANUAL",
      dates: Array.from({ length: 100 }, (_, id) => ({ ...fecha, id })),
    });
    expect(html).toMatch(
      /<button(?=[^>]*disabled="")(?=[^>]*aria-label="Duplicar encuentro 1")[^>]*>/,
    );
    expect(html).toMatch(
      /<button(?=[^>]*disabled="")(?=[^>]*class="secondary-action add-date")[^>]*>/,
    );
    expect(html).toContain("Máximo de 100 encuentros");
  });
  it("la regla no generada no muestra ninguna fecha obsoleta como vista previa", () => {
    const html = editor({ dateMode: "RECURRENT", recurrenceGenerated: false });
    expect(html).toContain("Generar vista previa");
    expect(html).not.toContain('value="2026-11-10"');
    expect(editor({ dateMode: "RECURRENT", recurrenceGenerated: true })).toContain("1 encuentro");
  });
  it("programa precede a título y la descripción empieza plegada", () => {
    const html = renderToStaticMarkup(
      createElement(AcademicDetails, {
        programs: [program],
        selectedProgramId: "uno",
        title: "",
        onProgramChange: noop,
        onTitleChange: noop,
      }),
    );
    expect(html.indexOf('name="docenteProgramaId"')).toBeLessThan(html.indexOf('name="titulo"'));
    expect(html).toMatch(/<details[^>]*><summary>Descripción general \(opcional\)<\/summary>/);
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).not.toContain("Paso 1");
  });
  it("el formulario inicial conserva campos, sin stepper, y presenta tipo, datos, fechas, organización y resumen en orden", () => {
    const html = renderToStaticMarkup(
      createElement(MeetingFormZoom, {
        programs: [program],
        assistants: [],
        canAssignAssistant: false,
      }),
    );
    const posiciones = [
      "Tipo de reunión",
      'id="datos-academicos"',
      'id="fechas"',
      'id="organizacion"',
      "Resumen de la reunión",
    ].map((texto) => html.indexOf(texto));
    expect(posiciones.every((valor) => valor >= 0)).toBe(true);
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
    expect(html).not.toContain("meeting-form-steps");
    expect(html).not.toMatch(/Paso [123]/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain('aria-busy="false"');
  });
});

// Inspección del árbol puro para ejercitar los callbacks sin DOM ni dependencias nuevas.
function elementos(nodo: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(nodo)) {
    return nodo.flatMap(elementos);
  }
  if (!isValidElement<Record<string, unknown>>(nodo)) {
    return [];
  }
  return [nodo, ...elementos(nodo.props["children"] as ReactNode)];
}

describe("A2: resumen derivado", () => {
  it("muestra datos académicos, tipo, extremos en Montevideo y enlace único sin identificadores", () => {
    const html = resumen({
      dateMode: "MANUAL",
      dates: [fecha, { ...fecha, id: 6, fecha: "2026-11-12" }],
    });
    for (const texto of [
      "Serie de encuentros",
      "Educación",
      "Ana Pérez",
      "2 encuentros",
      "Primera fecha",
      "Última fecha",
      "10 de noviembre de 2026, 23:00–23:45",
      "12 de noviembre de 2026, 23:00–23:45",
      "America/Montevideo",
      "Un solo enlace de Zoom para todos los encuentros",
    ]) {
      expect(html).toContain(texto);
    }
    expect(html).not.toMatch(/https?:|start_url|join_url|ID de Zoom/);
  });
  it("es plegable y el live region solo contiene estado breve, sin fechas ni contenido tecleado", () => {
    const html = resumen();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="resumen-reunion-contenido"');
    const live = html.match(/<p[^>]*role="status" aria-live="polite"[^>]*>(.*?)<\/p>/s)![1];
    expect(live).toContain("1 encuentro");
    expect(live).toContain("Listo para crear");
    expect(live).not.toContain("noviembre");
    expect(live).not.toContain("Ana");
  });
  it("deriva grabación y cobertura virtual fija, sin asignación para quien no administra", () => {
    const html = resumen({
      requiresAssistance: true,
      requiresRecording: true,
      assistanceMode: "ASSIGN",
      selectedAssistant: { id: "a", label: "Luis" },
    });
    expect(html).toContain("Con monitoreo · Se graba");
    expect(html).toContain("15 minutos antes");
    expect(html).toContain("fin exacto");
    expect(html).not.toContain("Luis");
    expect(html).not.toContain("Asignación");
  });
  it("híbrida informa llegadas y salidas definidas y el margen mínimo; administración ve su asignación", () => {
    const html = resumen({
      requiresAssistance: true,
      meetingMode: "HIBRIDA",
      canAssignAssistant: true,
      assistanceMode: "ASSIGN",
      selectedAssistant: { id: "a", label: "Luis" },
    });
    expect(html).toContain("Híbrida");
    expect(html).toContain("mínimo 30 minutos antes y después");
    expect(html).toContain("22:30");
    expect(html).toContain("00:15");
    expect(html).toContain("Asignación");
    expect(html).toContain("Luis");
    expect(resumen({ requiresAssistance: true, canAssignAssistant: true })).toContain(
      "Abierta a postulaciones",
    );
  });
  it("sin monitoreo resume modalidad virtual y no muestra horarios ni asignación residuales", () => {
    const html = resumen({
      meetingMode: "HIBRIDA",
      canAssignAssistant: true,
      assistanceMode: "ASSIGN",
      selectedAssistant: { id: "a", label: "Luis" },
    });
    expect(html).toContain("Virtual");
    expect(html).not.toContain("Híbrida");
    expect(html).not.toContain("22:30");
    expect(html).not.toContain("Luis");
  });
});

describe("A2: orden explícito y fechas inválidas", () => {
  it("sin filas desordenadas no ofrece el botón de ordenar", () => {
    const html = editor({
      dateMode: "MANUAL",
      dates: [{ ...fecha, fecha: "2026-11-09", id: 8 }, fecha],
    });
    expect(html).not.toContain("Ordenar por fecha y hora");
  });
  it("el botón de ordenar invoca onSort", () => {
    let veces = 0;
    const tree = MeetingInstancesEditor({
      dates: [fecha, { ...fecha, id: 8, fecha: "2026-11-09" }],
      dateMode: "MANUAL",
      requiresAssistance: false,
      meetingMode: "VIRTUAL",
      onFieldChange: noop,
      onTimeChange: noop,
      onAdd: noop,
      onRemove: noop,
      onDuplicate: noop,
      onSort: () => {
        veces++;
      },
    });
    const boton = elementos(tree).find(
      (n) => n.type === "button" && n.props["data-accion"] === "ordenar",
    )!;
    (boton.props["onClick"] as () => void)();
    expect(veces).toBe(1);
  });
});
