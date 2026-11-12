import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingScheduleTimes } from "../src/components/meeting-schedule-times";

const start = "2026-10-10T10:00:00-03:00";
const end = "2026-10-10T17:00:00-03:00";
const arrival = "2026-10-10T09:30:00-03:00";
const departure = "2026-10-10T17:30:00-03:00";

function renderSchedule(props: Partial<Parameters<typeof MeetingScheduleTimes>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(MeetingScheduleTimes, {
      startsAt: start,
      endsAt: end,
      requiresAssistance: true,
      modality: "HIBRIDA",
      assistanceStartsAt: arrival,
      assistanceEndsAt: departure,
      ...props
    })
  );
}

describe("horarios de reunión y cobertura en todos los roles", () => {
  it("distingue la llegada del asistente y el inicio del encuentro", () => {
    const html = renderSchedule({ viewerIsAssistant: true });
    expect(html).toContain("Tu monitoreo");
    expect(html).toContain("Tenés que estar desde las");
    expect(html).toContain("09:30");
    expect(html).toContain("17:30");
    expect(html).toContain("Horario del encuentro");
    expect(html).toContain("La reunión empieza: 10:00");
    expect(html).toContain("Finaliza: 17:00");
  });

  it("comunica ambos horarios a docentes y administración", () => {
    const html = renderSchedule({ viewerIsAssistant: false });
    expect(html).toContain("Horario de monitoreo");
    expect(html).toContain("Llegada del asistente:");
    expect(html).toContain("Horario del encuentro");
  });

  it("no inventa una llegada para una reunión híbrida sin configuración", () => {
    const html = renderSchedule({ assistanceStartsAt: null, assistanceEndsAt: null });
    expect(html).toContain("Horario técnico por confirmar");
    expect(html).toContain("debe definir la llegada y salida");
    expect(html).not.toContain("Llegada del asistente: 10:00");
  });

  it("diferencia propósito incluso cuando el horario técnico coincide en una reunión virtual", () => {
    const html = renderSchedule({
      modality: "VIRTUAL",
      assistanceStartsAt: null,
      assistanceEndsAt: null
    });
    expect(html).toContain("Horario de monitoreo");
    expect(html).toContain("Horario del encuentro");
    expect(html).toContain("09:45");
    expect(html).toContain("17:00");
    expect(html).not.toContain("Horario técnico por confirmar");
  });

  it("omite cobertura cuando no se requiere, sin ocultar la hora del encuentro", () => {
    const html = renderSchedule({ requiresAssistance: false });
    expect(html).not.toContain("Horario de monitoreo");
    expect(html).toContain("La reunión empieza: 10:00");
  });
});
