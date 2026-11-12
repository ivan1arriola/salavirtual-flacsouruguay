import { describe, expect, it } from "vitest";
import {
  filtrarEventosAuditoriaConferencia,
  type EventoAuditoriaMeet
} from "../src/modules/archivos/infrastructure/google/google-meet-audit-emails.client";

const evento = (conferenceId: string, timestamp: string): EventoAuditoriaMeet => ({
  conferenceId,
  endpointId: `endpoint-${conferenceId}`,
  meetingCode: "abc-def-ghi",
  identifier: "student@example.com",
  identifierType: "email_address",
  displayName: "Student",
  timestamp,
  durationSeconds: 600,
  parameters: []
});

describe("atribución de eventos Reports a conferencia Meet", () => {
  it("mantiene eventos brutos pero no atribuye correos cuando hay IDs superpuestos ambiguos", () => {
    const result = filtrarEventosAuditoriaConferencia(
      [evento("reports-conf-1", "2026-05-01T10:10:00Z"), evento("reports-conf-2", "2026-05-01T10:12:00Z")],
      "2026-05-01T10:00:00Z",
      "2026-05-01T11:00:00Z"
    );
    expect(result.eventosSolapados).toHaveLength(2);
    expect(result.eventosAtribuibles).toHaveLength(0);
  });

  it("atribuye eventos únicamente cuando hay un solo ID de conferencia en el intervalo", () => {
    const result = filtrarEventosAuditoriaConferencia(
      [evento("reports-conf-1", "2026-05-01T10:10:00Z"), evento("outside", "2026-05-01T12:10:00Z")],
      "2026-05-01T10:00:00Z",
      "2026-05-01T11:00:00Z"
    );
    expect(result.eventosSolapados).toHaveLength(1);
    expect(result.eventosAtribuibles.map((value) => value.conferenceId)).toEqual(["reports-conf-1"]);
  });
});
