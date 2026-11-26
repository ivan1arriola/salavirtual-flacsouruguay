import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  interpretarAvisoZoom,
  interpretarAvisoAdicionalZoom,
  respuestaValidacionZoom,
  verificarFirmaWebhookZoom
} from "../src/integrations/zoom/zoom-webhook";

const ahora = new Date("2026-11-13T12:00:00Z");
const secreto = String(ahora.getTime());
const timestamp = String(Math.floor(ahora.getTime() / 1000));
const cuerpo = JSON.stringify({
  event: "meeting.ended",
  event_ts: ahora.getTime(),
  payload: {
    account_id: "cuenta-zoom",
    object: {
      id: 123456789,
      uuid: "a/b//c",
      host_id: "host-1",
      topic: "Seminario",
      start_time: "2026-11-13T10:00:00Z",
      end_time: "2026-11-13T11:00:00Z",
      recording_files: [{ download_url: "https://secret.example/archivo" }]
    }
  }
});
const firma = (body: string, ts = timestamp) => {
  const mensaje = ["v0", ts, body].join(":");
  return `v0=${createHmac("sha256", secreto).update(mensaje).digest("hex")}`;
};

describe("webhook firmado de Zoom", () => {
  it("comprueba cuerpo crudo, sello de tiempo y firma sin aceptar variantes vencidas", () => {
    expect(verificarFirmaWebhookZoom(secreto, cuerpo, timestamp, firma(cuerpo), ahora)).toBe(true);
    expect(verificarFirmaWebhookZoom(secreto, `${cuerpo} `, timestamp, firma(cuerpo), ahora)).toBe(false);
    expect(verificarFirmaWebhookZoom(`${secreto}x`, cuerpo, timestamp, firma(cuerpo), ahora)).toBe(false);
    expect(verificarFirmaWebhookZoom(secreto, cuerpo, timestamp, null, ahora)).toBe(false);
    const viejo = String(Number(timestamp) - 301);
    expect(verificarFirmaWebhookZoom(secreto, cuerpo, viejo, firma(cuerpo, viejo), ahora)).toBe(false);
    const futuro = String(Number(timestamp) + 301);
    expect(verificarFirmaWebhookZoom(secreto, cuerpo, futuro, firma(cuerpo, futuro), ahora)).toBe(false);
  });

  it("interpreta los identificadores de AI Companion y grabaciones en lote documentados por Zoom", () => {
    const base = { event_ts: ahora.getTime() };
    const ai = JSON.stringify({
      ...base,
      event: "meeting.ai_companion_started",
      payload: {
        account_id: "cuenta",
        object: { meeting_number: 123, meeting_uuid: "uuid-1", ai_companion: { summary: true } }
      }
    });
    expect(interpretarAvisoAdicionalZoom(ai)).toMatchObject({ recursoId: "123", uuid: "uuid-1" });
    const resumen = JSON.stringify({
      ...base,
      event: "meeting.summary_completed",
      payload: {
        account_id: "cuenta",
        object: { meeting_id: 456, meeting_uuid: "uuid-2" }
      }
    });
    expect(interpretarAvisoAdicionalZoom(resumen)).toMatchObject({ recursoId: "456", uuid: "uuid-2" });
    const lote = JSON.stringify({
      ...base,
      event: "recording.batch_deleted",
      payload: {
        account_id: "cuenta",
        object: {
          meetings: [{ meeting_uuid: "uuid-1", recording_file_ids: ["secreto"] }, { meeting_uuid: "uuid-2" }]
        }
      }
    });
    const resultado = interpretarAvisoAdicionalZoom(lote);
    expect(resultado).toMatchObject({ uuids: ["uuid-1", "uuid-2"] });
    expect(JSON.stringify(resultado)).not.toContain("secreto");
    const papelera = JSON.stringify({
      ...base,
      event: "recording.batch_trashed",
      payload: {
        account_id: "cuenta",
        object: { meeting_uuids: ["uuid-1", "uuid-2"] }
      }
    });
    expect(interpretarAvisoAdicionalZoom(papelera)).toMatchObject({ uuids: ["uuid-1", "uuid-2"] });
  });

  it("responde al desafío y conserva solo metadatos mínimos del aviso", () => {
    expect(respuestaValidacionZoom(secreto, "desafio").encryptedToken).toBe(
      createHmac("sha256", secreto).update("desafio").digest("hex")
    );
    const aviso = interpretarAvisoZoom(cuerpo);
    expect(aviso).toMatchObject({ tipo: "meeting.ended", uuid: "a/b//c", meetingId: "123456789" });
    expect(JSON.stringify(aviso)).not.toContain("secret.example");
    expect(
      interpretarAvisoZoom(JSON.stringify({ ...JSON.parse(cuerpo), event: "meeting.participant_joined" }))
    ).toBeNull();
  });

  it("correlaciona nuevos eventos de participantes y conserva solo detalles operativos", () => {
    const cambioRol = JSON.stringify({
      event: "meeting.participant_role_changed",
      event_ts: ahora.getTime(),
      payload: {
        account_id: "cuenta",
        object: {
          id: 123,
          uuid: "uuid-1",
          participant: {
            participant_uuid: "participante-opaco",
            participant_user_id: "usuario-id",
            old_role: "attendee",
            new_role: "co-host",
            user_name: "Nombre privado",
            email: "privado@example.org"
          }
        }
      }
    });
    const resultado = interpretarAvisoAdicionalZoom(cambioRol);
    expect(resultado).toMatchObject({
      tipo: "meeting.participant_role_changed",
      participanteId: "participante-opaco",
      detalle: "Rol: participante → coanfitrión"
    });
    expect(resultado?.participanteNombre).toBe("Nombre privado");
    expect(resultado?.participanteEmail).toBe("privado@example.org");

    const espera = JSON.stringify({
      event: "meeting.participant_jbh_waiting_left",
      event_ts: ahora.getTime(),
      payload: {
        account_id: "cuenta",
        object: {
          id: 123,
          uuid: "uuid-1",
          participant: { participant_user_id: "id-participante" }
        }
      }
    });
    expect(interpretarAvisoAdicionalZoom(espera)).toMatchObject({
      tipo: "meeting.participant_jbh_waiting_left",
      participanteId: "id-participante"
    });
  });
});

const crear = vi.hoisted(() => vi.fn());
const crearAdicional = vi.hoisted(() => vi.fn());
const buscarConfiguracion = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/db", () => ({
  db: {
    eventoWebhookZoom: { createMany: crear },
    eventoWebhookZoomAdicional: { createMany: crearAdicional },
    configuracionZoom: { findUnique: buscarConfiguracion }
  }
}));
vi.mock("../src/lib/config/encryption", () => ({ descifrarConfiguracion: () => secreto }));
import { POST } from "../app/api/v1/webhooks/zoom/route";

function peticion(body: string, signed = true) {
  return new Request("http://localhost/api/v1/webhooks/zoom", {
    method: "POST",
    headers: {
      "x-zm-request-timestamp": String(Math.floor(Date.now() / 1000)),
      ...(signed ? { "x-zm-signature": firma(body, String(Math.floor(Date.now() / 1000))) } : {})
    },
    body
  });
}

afterEach(() => {
  crear.mockReset();
  crearAdicional.mockReset();
  buscarConfiguracion.mockReset();
});

describe("recepción durable", () => {
  it("valida el desafío, rechaza firmas falsas y persiste avisos sin procesarlos en la ruta", async () => {
    buscarConfiguracion.mockResolvedValue({ webhookSecretCifrado: "cifrado" });
    const desafio = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "abc" } });
    expect(await (await POST(peticion(desafio))).json()).toEqual(respuestaValidacionZoom(secreto, "abc"));
    expect((await POST(peticion(cuerpo, false))).status).toBe(401);
    crear.mockResolvedValue({ count: 1 });
    expect((await POST(peticion(cuerpo))).status).toBe(204);
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(JSON.stringify(crear.mock.calls[0])).not.toContain("secret.example");
  });

  it("guarda metadatos de un evento de grupo sin almacenar información sensible", async () => {
    buscarConfiguracion.mockResolvedValue({ webhookSecretCifrado: "cifrado" });
    crearAdicional.mockResolvedValue({ count: 1 });
    const grupo = JSON.stringify({
      event: "group.created",
      event_ts: Date.now(),
      payload: { account_id: "cuenta-zoom", object: { id: "grupo-1", name: "privado" }, token: "secreto" }
    });
    expect((await POST(peticion(grupo))).status).toBe(204);
    expect(crearAdicional).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            tipo: "group.created",
            cuentaZoomId: "cuenta-zoom",
            recursoId: "grupo-1"
          })
        ],
        skipDuplicates: true
      })
    );
    expect(JSON.stringify(crearAdicional.mock.calls)).not.toContain("secreto");
    expect(JSON.stringify(crearAdicional.mock.calls)).not.toContain("privado");
  });

  it("persiste eventos en vivo por ejecución, con identidad seleccionada, idempotente y fuera de orden", async () => {
    buscarConfiguracion.mockResolvedValue({ webhookSecretCifrado: "cifrado" });
    crearAdicional.mockResolvedValue({ count: 0 });
    const evento = (event: string, uuid: string, ts: number, extra: object = {}) =>
      JSON.stringify({
        event,
        event_ts: ts,
        payload: {
          account_id: "cuenta",
          object: {
            id: 777,
            uuid,
            join_url: "https://secret.example/j",
            participant: {
              participant_uuid: "p-1",
              user_name: "Ana Pérez",
              email: "ana@x.uy",
              public_ip: "ip-privada"
            },
            ...extra
          }
        }
      });
    // Serie: mismo Meeting ID, UUID distintos; llegan desordenados y uno repetido.
    const cuerpos = [
      evento("meeting.participant_left", "uuid-B", 3000),
      evento("meeting.participant_joined", "uuid-A", 1000),
      evento("meeting.participant_joined", "uuid-A", 1000),
      evento("meeting.alert", "uuid-A", 2000, { issues: ["Unstable audio quality"] }),
      evento("recording.started", "uuid-B", 2500)
    ];
    for (const c of cuerpos) {
      expect((await POST(peticion(c))).status).toBe(204);
    }
    const filas = crearAdicional.mock.calls.map(([arg]) => arg.data[0]);
    expect(filas.every((f) => f.recursoId === "777")).toBe(true);
    expect(filas.map((f) => f.uuid)).toEqual(["uuid-B", "uuid-A", "uuid-A", "uuid-A", "uuid-B"]);
    expect(filas[1].huella).toBe(filas[2].huella); // duplicado: misma huella, lo absorbe skipDuplicates
    expect(filas[1].huella).not.toBe(filas[0].huella);
    expect(filas[1].participanteId).toBe("p-1");
    expect(filas[3].detalle).toBe("Unstable audio quality");
    expect(filas[1].participanteNombre).toBe("Ana Pérez");
    expect(filas[1].participanteEmail).toBe("ana@x.uy");
    const guardado = JSON.stringify(filas);
    for (const prohibido of ["ip-privada", "secret.example"]) {
      expect(guardado).not.toContain(prohibido);
    }
    expect(crearAdicional.mock.calls.every(([a]) => a.skipDuplicates === true)).toBe(true);
  });

  it("acepta eventos en vivo sin reunión asociada y rechaza firma inválida o falla de persistencia", async () => {
    buscarConfiguracion.mockResolvedValue({ webhookSecretCifrado: "cifrado" });
    crearAdicional.mockResolvedValue({ count: 1 });
    const huerfano = JSON.stringify({
      event: "meeting.sharing_started",
      event_ts: 5,
      payload: { account_id: "cuenta", object: { id: 9 } }
    });
    expect((await POST(peticion(huerfano))).status).toBe(204);
    expect(crearAdicional.mock.calls[0][0].data[0]).toMatchObject({ uuid: null, participanteId: null });
    expect((await POST(peticion(huerfano, false))).status).toBe(401);
    expect(crearAdicional).toHaveBeenCalledTimes(1);
    crearAdicional.mockRejectedValue(new Error("DB caída"));
    expect((await POST(peticion(huerfano))).status).toBe(503);
  });

  it("pide reintentar eventos adicionales si no se guardan o faltan datos esenciales", async () => {
    buscarConfiguracion.mockResolvedValue({ webhookSecretCifrado: "cifrado" });
    crearAdicional.mockRejectedValue(new Error("DB caída"));
    const evento = {
      event: "meeting.participant_joined",
      event_ts: Date.now(),
      payload: { account_id: "cuenta", object: { id: 123 } }
    };
    expect((await POST(peticion(JSON.stringify(evento)))).status).toBe(503);
    expect((await POST(peticion(JSON.stringify({ ...evento, payload: {} })))).status).toBe(503);
  });

  it("pide a Zoom reintentar si la base no confirmó el aviso", async () => {
    buscarConfiguracion.mockResolvedValue({ webhookSecretCifrado: "cifrado" });
    crear.mockRejectedValue(new Error("DB caída"));
    expect((await POST(peticion(cuerpo))).status).toBe(503);
    const incompleto = JSON.stringify({ event: "meeting.ended", payload: { object: {} } });
    expect((await POST(peticion(incompleto))).status).toBe(503);
  });

  it("rechaza eventos sin un secreto guardado y no confirma si falla la lectura", async () => {
    buscarConfiguracion.mockResolvedValue(null);
    expect((await POST(peticion(cuerpo))).status).toBe(503);
    buscarConfiguracion.mockRejectedValue(new Error("DB caída"));
    expect((await POST(peticion(cuerpo))).status).toBe(503);
    expect(crear).not.toHaveBeenCalled();
  });
});
