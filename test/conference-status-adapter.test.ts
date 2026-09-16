import { describe, expect, it, vi } from "vitest";
import { getMeetConferenceSnapshot } from "../src/modules/meet/conference-status.adapter";

const inicio = new Date("2026-09-16T21:30:00.000Z");
const fin = new Date("2026-09-16T23:00:00.000Z");

describe("getMeetConferenceSnapshot", () => {
  it("normaliza una conferencia activa con participantes", async () => {
    const client = {
      buscarConferencia: vi.fn(async () => ({
        name: "conferenceRecords/actual",
        startTime: "2026-09-16T21:42:00.000Z"
      })),
      obtenerSesionesParticipantes: vi.fn(async () => ([{
        sessionId: "participants/1/participantSessions/a",
        displayName: "Docente Uno",
        startTime: "2026-09-16T21:43:00.000Z"
      }])),
      obtenerArtefactos: vi.fn(async () => ({
        recordings: [], transcripts: [], notes: [], estadoGrabacion: "AUSENTE", pendientes: 0
      }))
    };

    const snapshot = await getMeetConferenceSnapshot("abc-defg-hij", inicio, fin, client);

    expect(snapshot?.startedAt).toEqual(new Date("2026-09-16T21:42:00.000Z"));
    expect(snapshot?.endedAt).toBeNull();
    expect(snapshot?.participants).toEqual([{
      sessionId: "participants/1/participantSessions/a",
      displayName: "Docente Uno",
      joinedAt: new Date("2026-09-16T21:43:00.000Z"),
      leftAt: null,
      active: true
    }]);
    expect(snapshot?.recording).toEqual({ status: "NO_INICIADA", url: null });
  });

  it("marca grabación pendiente como PROCESANDO en una conferencia finalizada", async () => {
    const client = {
      buscarConferencia: vi.fn(async () => ({
        name: "conferenceRecords/finalizada",
        startTime: "2026-09-16T21:42:00.000Z",
        endTime: "2026-09-16T23:03:00.000Z"
      })),
      obtenerSesionesParticipantes: vi.fn(async () => []),
      obtenerArtefactos: vi.fn(async () => ({
        recordings: [], transcripts: [], notes: [], estadoGrabacion: "PROCESANDO", pendientes: 1
      }))
    };

    const snapshot = await getMeetConferenceSnapshot("abc-defg-hij", inicio, fin, client);

    expect(snapshot?.endedAt).toEqual(new Date("2026-09-16T23:03:00.000Z"));
    expect(snapshot?.recording.status).toBe("PROCESANDO");
  });

  it("devuelve null cuando Meet no encuentra una conferencia", async () => {
    const client = {
      buscarConferencia: vi.fn(async () => null),
      obtenerSesionesParticipantes: vi.fn(),
      obtenerArtefactos: vi.fn()
    };

    expect(await getMeetConferenceSnapshot("abc-defg-hij", inicio, fin, client)).toBeNull();
    expect(client.obtenerSesionesParticipantes).not.toHaveBeenCalled();
    expect(client.obtenerArtefactos).not.toHaveBeenCalled();
  });
});
