import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import {
  actualizarEspacioMeetHttp,
  crearEspacioMeetHttp,
  crearMiembroMeetHttp,
  eliminarMiembroMeetHttp,
  isAlreadyCohostError,
  isMeetNotFoundError,
  isMemberPermissionError,
  listarMiembrosMeetHttp,
  obtenerEspacioMeet,
  type GoogleMeetSpace,
  type GoogleMeetSpaceMember,
} from "../src/integrations/google/meet";

describe("integrations/google/meet", () => {
  const spaceName = "spaces/space-123";
  const meetingCode = "abc-defg-hij";

  it("obtenerEspacioMeet llama a la URL adecuada para spaceName y para meetingCode", async () => {
    const auth = {
      request: vi.fn().mockResolvedValue({ data: { name: spaceName } }),
    } as unknown as JWT;

    await obtenerEspacioMeet(auth, meetingCode);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://meet.googleapis.com/v2/spaces/abc-defg-hij",
        method: "GET",
      }),
    );

    await obtenerEspacioMeet(auth, spaceName);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://meet.googleapis.com/v2/spaces/space-123",
        method: "GET",
      }),
    );
  });

  it("crearEspacioMeetHttp realiza POST con la configuración dada", async () => {
    const spaceData: GoogleMeetSpace = {
      name: spaceName,
      meetingCode,
      meetingUri: "https://meet.google.com/abc-defg-hij",
    };
    const auth = {
      request: vi.fn().mockResolvedValue({ data: spaceData }),
    } as unknown as JWT;

    const result = await crearEspacioMeetHttp(auth, { moderation: "ON", accessType: "TRUSTED" });
    expect(result).toEqual(spaceData);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://meet.googleapis.com/v2/spaces",
        method: "POST",
        data: { config: { moderation: "ON", accessType: "TRUSTED" } },
      }),
    );
  });

  it("actualizarEspacioMeetHttp realiza PATCH con updateMask y config", async () => {
    const auth = {
      request: vi.fn().mockResolvedValue({ data: { name: spaceName } }),
    } as unknown as JWT;

    await actualizarEspacioMeetHttp(auth, spaceName, { moderation: "ON" }, ["config.moderation"]);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://meet.googleapis.com/v2/spaces/space-123?updateMask=config.moderation",
        method: "PATCH",
        data: { name: spaceName, config: { moderation: "ON" } },
      }),
    );
  });

  it("listarMiembrosMeetHttp pagina todas las páginas con nextPageToken", async () => {
    const page1: GoogleMeetSpaceMember[] = [
      { name: "spaces/space-123/members/1", email: "a@flacso.edu.uy", role: "COHOST" },
    ];
    const page2: GoogleMeetSpaceMember[] = [
      { name: "spaces/space-123/members/2", email: "b@flacso.edu.uy", role: "COHOST" },
    ];

    const auth = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ data: { members: page1, nextPageToken: "token-2" } })
        .mockResolvedValueOnce({ data: { members: page2 } }),
    } as unknown as JWT;

    const members = await listarMiembrosMeetHttp(auth, spaceName);
    expect(members).toHaveLength(2);
    expect(members).toEqual([...page1, ...page2]);
    expect(auth.request).toHaveBeenCalledTimes(2);
  });

  it("crearMiembroMeetHttp realiza POST a members con email y role", async () => {
    const member: GoogleMeetSpaceMember = {
      name: "spaces/space-123/members/docente",
      email: "docente@flacso.edu.uy",
      role: "COHOST",
    };
    const auth = {
      request: vi.fn().mockResolvedValue({ data: member }),
    } as unknown as JWT;

    const result = await crearMiembroMeetHttp(auth, spaceName, "docente@flacso.edu.uy", "COHOST");
    expect(result).toEqual(member);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://meet.googleapis.com/v2/spaces/space-123/members",
        method: "POST",
        data: { email: "docente@flacso.edu.uy", role: "COHOST" },
      }),
    );
  });

  it("eliminarMiembroMeetHttp realiza DELETE al recurso del miembro", async () => {
    const auth = {
      request: vi.fn().mockResolvedValue({ data: {} }),
    } as unknown as JWT;

    await eliminarMiembroMeetHttp(auth, "spaces/space-123/members/1");
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://meet.googleapis.com/v2/spaces/space-123/members/1",
        method: "DELETE",
      }),
    );
  });

  describe("analizadores de error", () => {
    it("isAlreadyCohostError detecta 409 y ALREADY_EXISTS", () => {
      expect(isAlreadyCohostError({ code: 409 })).toBe(true);
      expect(isAlreadyCohostError({ response: { status: 409 } })).toBe(true);
      expect(isAlreadyCohostError({ response: { data: { error: "ALREADY_EXISTS" } } })).toBe(true);
      expect(isAlreadyCohostError({ code: 404 })).toBe(false);
      expect(isAlreadyCohostError(undefined)).toBe(false);
    });

    it("isMeetNotFoundError detecta 404", () => {
      expect(isMeetNotFoundError({ code: 404 })).toBe(true);
      expect(isMeetNotFoundError({ response: { status: 404 } })).toBe(true);
      expect(isMeetNotFoundError({ code: 403 })).toBe(false);
    });

    it("isMemberPermissionError detecta 403 con 'resource member' o 'permission denied'", () => {
      expect(
        isMemberPermissionError({
          code: 403,
          message: "403: Permission denied on resource Member",
        }),
      ).toBe(true);
      expect(
        isMemberPermissionError({
          response: { status: 403, data: "Permission denied on resource member" },
        }),
      ).toBe(true);
      expect(
        isMemberPermissionError({
          code: 403,
          message: "Permission denied on resource Space",
        }),
      ).toBe(false);
      expect(isMemberPermissionError({ code: 404 })).toBe(false);
    });
  });
});
