import { describe, expect, it } from "vitest";
import { buildAssignmentSuggestions } from "../src/modules/asistencia/asignacion-sugerencias.service";

const meeting = (id: string, start: string, end: string, applicants: string[] = []) => ({
  covered: false,
  meeting: {
    id,
    inicioProgramadoAt: new Date(start),
    finProgramadoAt: new Date(end),
    timezone: "America/Montevideo",
    intereses: applicants.map((assistantId) => ({ asistente: { id: assistantId } }))
  }
});

describe("buildAssignmentSuggestions", () => {
  it("prioriza postulantes disponibles sobre otros asistentes", () => {
    const result = buildAssignmentSuggestions({
      meetings: [
        meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z", ["assistant-2"])
      ],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" }
      ],
      assignments: []
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-2");
    expect(result.get("meeting-1")?.reason).toContain("Postulante");
  });

  it("usa un asistente activo cuando todos los postulantes tienen conflicto", () => {
    const result = buildAssignmentSuggestions({
      meetings: [
        meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z", ["assistant-1"])
      ],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" }
      ],
      assignments: [
        {
          assistantId: "assistant-1",
          meetingId: "existing",
          startsAt: new Date("2026-08-10T13:30:00Z"),
          endsAt: new Date("2026-08-10T14:30:00Z"),
          timezone: "America/Montevideo"
        }
      ]
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-2");
    expect(result.get("meeting-1")?.reason).toContain("Sin postulantes disponibles");
  });

  it("evita recomendar la misma persona para reuniones pendientes superpuestas", () => {
    const result = buildAssignmentSuggestions({
      meetings: [
        meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z"),
        meeting("meeting-2", "2026-08-10T13:30:00Z", "2026-08-10T14:30:00Z")
      ],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" }
      ],
      assignments: []
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-1");
    expect(result.get("meeting-2")?.id).toBe("assistant-2");
  });
});
