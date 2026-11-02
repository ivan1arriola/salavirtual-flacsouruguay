import { describe, expect, it } from "vitest";
import { planificarMigracionZoom } from "../src/modules/reuniones/migracion-zoom-preview.domain";

const now = new Date("2026-11-02T12:00:00.000Z");
const start = new Date("2026-11-05T12:00:00.000Z");
const end = new Date("2026-11-05T13:00:00.000Z");

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    inicio: start,
    fin: end,
    estado: "PROGRAMADA" as const,
    proveedorActivo: "GOOGLE_MEET" as const,
    conservarGoogleMeet: false,
    meetSincronizado: true,
    meetJoinUrl: `https://meet.google.com/${id}`,
    zoomSincronizado: false,
    ...overrides,
  };
}

describe("planificarMigracionZoom", () => {
  it("reserva capacidad para candidatos simultáneos sin asignar dos reuniones a una sala", () => {
    const result = planificarMigracionZoom({
      ahora: now,
      margenSeguridadHoras: 24,
      candidatos: [candidate("b"), candidate("a")],
      hosts: [{ id: "sala01", prioridad: 1, limiteConcurrente: 1 }],
      reservasZoom: [],
    });

    expect(result.map(({ id, estado, hostId }) => ({ id, estado, hostId }))).toEqual([
      { id: "a", estado: "MIGRABLE", hostId: "sala01" },
      { id: "b", estado: "SIN_SALA", hostId: null },
    ]);
  });

  it("ignora una capacidad mayor configurada por error para una cuenta Zoom", () => {
    const result = planificarMigracionZoom({
      ahora: now,
      margenSeguridadHoras: 24,
      candidatos: [candidate("a"), candidate("b")],
      hosts: [{ id: "sala01", prioridad: 1, limiteConcurrente: 5 }],
      reservasZoom: [],
    });
    expect(result.map(({ estado }) => estado)).toEqual(["MIGRABLE", "SIN_SALA"]);
  });

  it("respeta excepciones y no consume sala para ellas", () => {
    const result = planificarMigracionZoom({
      ahora: now,
      margenSeguridadHoras: 24,
      candidatos: [candidate("a", { conservarGoogleMeet: true }), candidate("b")],
      hosts: [{ id: "sala01", prioridad: 1, limiteConcurrente: 1 }],
      reservasZoom: [],
    });

    expect(result.map(({ estado, hostId }) => ({ estado, hostId }))).toEqual([
      { estado: "EXCEPCION", hostId: null },
      { estado: "MIGRABLE", hostId: "sala01" },
    ]);
  });

  it("excluye encuentros próximos, pasados y sin Meet sincronizado", () => {
    const result = planificarMigracionZoom({
      ahora: now,
      margenSeguridadHoras: 24,
      candidatos: [
        candidate("a", { inicio: new Date("2026-11-02T13:00:00.000Z") }),
        candidate("b", { inicio: new Date("2026-11-01T12:00:00.000Z") }),
        candidate("c", { meetSincronizado: false }),
      ],
      hosts: [{ id: "sala01", prioridad: 1, limiteConcurrente: 1 }],
      reservasZoom: [],
    });

    expect(result.map(({ estado }) => estado)).toEqual(["NO_FUTURO", "CERCANO", "REVISAR"]);
  });
});
