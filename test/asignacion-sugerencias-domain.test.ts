import { describe, expect, it } from "vitest";
import {
  buildAssignmentSuggestions,
  evaluarDisponibilidad,
} from "../src/modules/asistencia/asignacion-sugerencias.service";

const meeting = (id: string, start: string, end: string, applicants: string[] = []) => ({
  covered: false,
  meeting: {
    id,
    inicioProgramadoAt: new Date(start),
    finProgramadoAt: new Date(end),
    inicioAsistenciaTecnicaAt: null as Date | null,
    finAsistenciaTecnicaAt: null as Date | null,
    timezone: "America/Montevideo",
    postulaciones: applicants.map((assistantId) => ({ asistenteTecnico: { id: assistantId } })),
  },
});

describe("buildAssignmentSuggestions", () => {
  it("excluye asistentes cesados hasta su próximo inicio de sesión", () => {
    const result = buildAssignmentSuggestions({
      meetings: [meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z", ["cesado"])],
      assistants: [
        { id: "cesado", name: "Cesado", cesadoHastaProximoInicioSesion: true },
        { id: "disponible", name: "Disponible" },
      ],
      assignments: [],
    });

    expect(result.get("meeting-1")?.id).toBe("disponible");
  });

  it("prioriza postulantes disponibles sobre otros asistentes", () => {
    const result = buildAssignmentSuggestions({
      meetings: [
        meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z", ["assistant-2"]),
      ],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" },
      ],
      assignments: [],
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-2");
    expect(result.get("meeting-1")?.reason).toContain("postuló");
  });

  it("usa un asistente activo cuando todos los postulantes tienen conflicto", () => {
    const result = buildAssignmentSuggestions({
      meetings: [
        meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z", ["assistant-1"]),
      ],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" },
      ],
      assignments: [
        {
          assistantId: "assistant-1",
          meetingId: "existing",
          startsAt: new Date("2026-08-10T13:30:00Z"),
          endsAt: new Date("2026-08-10T14:30:00Z"),
          timezone: "America/Montevideo",
        },
      ],
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-2");
    expect(result.get("meeting-1")?.reason).toContain("Sin postulantes disponibles");
  });

  it("evita recomendar la misma persona para reuniones pendientes superpuestas", () => {
    const result = buildAssignmentSuggestions({
      meetings: [
        meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z"),
        meeting("meeting-2", "2026-08-10T13:30:00Z", "2026-08-10T14:30:00Z"),
      ],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" },
      ],
      assignments: [],
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-1");
    expect(result.get("meeting-2")?.id).toBe("assistant-2");
  });

  it("exige media hora entre reuniones al recomendar asistentes", () => {
    const result = buildAssignmentSuggestions({
      meetings: [
        meeting("meeting-1", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z"),
        meeting("meeting-2", "2026-08-10T14:29:00Z", "2026-08-10T15:30:00Z"),
      ],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" },
      ],
      assignments: [],
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-1");
    expect(result.get("meeting-2")?.id).toBe("assistant-2");
  });

  it("usa el horario completo de monitoreo para detectar conflictos", () => {
    const pending = meeting("meeting-1", "2026-08-10T15:00:00Z", "2026-08-10T16:00:00Z");
    pending.meeting.inicioAsistenciaTecnicaAt = new Date("2026-08-10T14:00:00Z");
    pending.meeting.finAsistenciaTecnicaAt = new Date("2026-08-10T16:30:00Z");

    const result = buildAssignmentSuggestions({
      meetings: [pending],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno" },
      ],
      assignments: [
        {
          assistantId: "assistant-1",
          meetingId: "existing",
          startsAt: new Date("2026-08-10T13:00:00Z"),
          endsAt: new Date("2026-08-10T13:45:00Z"),
          timezone: "America/Montevideo",
        },
      ],
    });

    expect(result.get("meeting-1")?.id).toBe("assistant-2");
  });

  it("prioriza disponibilidad preferente y excluye una excepción no disponible", () => {
    const recurrent = [
      {
        diaSemana: 1,
        fecha: null,
        horaDesde: "09:00",
        horaHasta: "18:00",
        timezone: "America/Montevideo",
        tipo: "PREFERENTE" as const,
      },
    ];
    const result = buildAssignmentSuggestions({
      meetings: [meeting("meeting-1", "2026-08-10T16:00:00Z", "2026-08-10T17:00:00Z")],
      assistants: [
        { id: "assistant-1", name: "Ana" },
        { id: "assistant-2", name: "Bruno", disponibilidades: recurrent },
      ],
      assignments: [],
    });
    expect(result.get("meeting-1")).toMatchObject({
      id: "assistant-2",
      reason: expect.stringContaining("preferente"),
    });

    expect(
      evaluarDisponibilidad(new Date("2026-08-10T16:00:00Z"), new Date("2026-08-10T17:00:00Z"), [
        {
          ...recurrent[0],
          fecha: new Date("2026-08-10T00:00:00Z"),
          diaSemana: null,
          tipo: "NO_DISPONIBLE",
        },
      ]).tipo,
    ).toBe("NO_DISPONIBLE");
  });
});
