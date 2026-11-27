import { afterEach, describe, expect, it, vi } from "vitest";
import { obtenerParticipantesZoomEnVivoHttp } from "../src/integrations/zoom/zoom-live-participants.client";

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consulta de participantes en vivo de Zoom", () => {
  it("proyecta estado, rol y calidad sin conservar campos técnicos sensibles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respuesta({
        participants: [
          {
            participant_uuid: "conexion-1",
            participant_user_id: "usuario-1",
            user_name: "Docente",
            email: "docente@example.org",
            join_time: "2026-11-25T18:00:00Z",
            status: "in_meeting",
            role: "host",
            audio_quality: "good",
            video_quality: "fair",
            screen_share_quality: "poor",
            connection_type: "UDP",
            network_type: "Wifi",
            ip_address: "192.0.2.1",
            internal_ip_addresses: ["internal-ip-address"],
            mac_addr: "00:00:00:00:00:00",
            harddisk_id: "disk-privado",
            pc_name: "equipo-privado",
          },
          {
            participant_uuid: "conexion-2",
            user_name: "Participante en espera",
            join_time: "2026-11-25T18:02:00Z",
            status: "in_waiting_room",
          },
          {
            participant_uuid: "conexion-3",
            user_name: "Participante que salió",
            join_time: "2026-11-25T17:55:00Z",
            leave_time: "2026-11-25T18:03:00Z",
            leave_reason: "Someone got disconnected from the meeting.",
            status: "in_meeting",
          },
        ],
        next_page_token: "",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await obtenerParticipantesZoomEnVivoHttp("token", "123456789");

    expect(resultado.estado).toBe("DISPONIBLE");
    if (resultado.estado !== "DISPONIBLE") {
      throw new Error("Se esperaba una respuesta disponible de Zoom.");
    }
    expect(resultado.participantes).toHaveLength(3);
    expect(resultado.participantes[0]).toMatchObject({
      id: "conexion-1",
      nombre: "Docente",
      estado: "EN_REUNION",
      rol: "ANFITRION",
      calidadAudio: "good",
      calidadVideo: "fair",
      calidadPantalla: "poor",
      tipoConexion: "UDP",
      tipoRed: "Wifi",
    });
    expect(resultado.participantes[1]?.estado).toBe("EN_ESPERA");
    expect(resultado.participantes[2]).toMatchObject({
      estado: "DESCONECTADO",
      motivoSalida: "Desconexión o problema de red",
    });
    expect(JSON.stringify(resultado)).not.toContain("192.0.2.1");
    expect(JSON.stringify(resultado)).not.toContain("internal-ip-address");
    expect(JSON.stringify(resultado)).not.toContain("00:00:00:00:00:00");
    expect(JSON.stringify(resultado)).not.toContain("disk-privado");
    expect(JSON.stringify(resultado)).not.toContain("equipo-privado");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/metrics/meetings/123456789/participants?type=live&page_size=300"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("explica el HTTP 400 de Zoom cuando el plan o Dashboard no habilitan la API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respuesta(
          {
            code: 200,
            message:
              "Only available for ZMP and Business or higher accounts that have enabled the Dashboard feature.",
          },
          400,
        ),
      ),
    );

    const resultado = await obtenerParticipantesZoomEnVivoHttp("token", "123456789");

    expect(resultado).toMatchObject({
      estado: "NO_DISPONIBLE",
      motivo: "PLAN_DASHBOARD_REQUERIDO",
      httpStatus: 400,
      codigoZoom: 200,
    });
  });

  it("distingue scopes incorrectos de una respuesta vacía", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuesta({ code: 200, message: "Invalid scope" }, 403)),
    );

    const resultado = await obtenerParticipantesZoomEnVivoHttp("token", "123456789");

    expect(resultado).toMatchObject({
      estado: "NO_DISPONIBLE",
      motivo: "SIN_PERMISOS",
      httpStatus: 403,
    });
  });

  it("no convierte fallos de red en cero participantes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const resultado = await obtenerParticipantesZoomEnVivoHttp("token", "123456789");

    expect(resultado).toMatchObject({
      estado: "NO_DISPONIBLE",
      motivo: "ERROR_CONEXION",
    });
  });
});
