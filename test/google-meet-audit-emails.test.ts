import { beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.fn();
vi.mock("@/src/integrations/google", () => ({
  crearGoogleAuthJwt: () => ({ request }),
  conReintentosGoogleLectura: (fn: () => unknown) => fn(),
}));
import {
  obtenerEventosAuditoriaMeet,
  obtenerCorreosAuditoriaMeet,
} from "../src/modules/archivos/infrastructure/google/google-meet-audit-emails.client";
const input = {
  serviceAccountEmail: "svc@example.com",
  privateKey: "unused-test",
  adminEmail: "admin@example.com",
  meetingCode: "abc-def-ghi",
  startTime: "2026-05-01T00:00:00Z",
  endTime: "2026-05-02T00:00:00Z",
};
beforeEach(() => request.mockReset());
describe("Reports API de Meet", () => {
  it("pagina todos los eventos call_ended y conserva campos originales", async () => {
    request
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: { time: "2026-05-01T10:10:00Z" },
              events: [
                {
                  name: "call_ended",
                  parameters: [
                    { name: "conference_id", value: "conf1" },
                    { name: "endpoint_id", value: "end1" },
                    { name: "meeting_code", value: "abcdefghi" },
                    { name: "identifier", value: "anon" },
                    { name: "identifier_type", value: "device" },
                    { name: "duration_seconds", intValue: "600" },
                  ],
                },
              ],
            },
          ],
          nextPageToken: "next",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: { time: "2026-05-01T11:10:00Z" },
              events: [
                {
                  name: "call_ended",
                  parameters: [
                    { name: "conference_id", value: "conf2" },
                    { name: "endpoint_id", value: "end2" },
                    { name: "meeting_code", value: "abc-def-ghi" },
                    { name: "identifier", value: "s@example.com" },
                    { name: "identifier_type", value: "email_address" },
                    { name: "duration_seconds", intValue: "600" },
                  ],
                },
              ],
            },
          ],
        },
      });
    const rows = await obtenerEventosAuditoriaMeet(input);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      conferenceId: "conf1",
      endpointId: "end1",
      meetingCode: "abcdefghi",
      identifier: "anon",
      identifierType: "device",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("no atribuye a correo identificadores cuyo tipo no sea email_address", async () => {
    request.mockResolvedValue({
      data: {
        items: [
          {
            id: { time: "2026-05-01T10:10:00Z" },
            events: [
              {
                name: "call_ended",
                parameters: [
                  { name: "conference_id", value: "conf1" },
                  { name: "meeting_code", value: "abcdefghi" },
                  { name: "identifier", value: "person@example.com" },
                  { name: "identifier_type", value: "device" },
                ],
              },
            ],
          },
        ],
      },
    });
    await expect(obtenerCorreosAuditoriaMeet(input)).resolves.toEqual([]);
  });
});
