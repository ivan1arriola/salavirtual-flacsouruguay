import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  interpretarAvisoZoom,
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
});

const crear = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/db", () => ({ db: { eventoWebhookZoom: { createMany: crear } } }));
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
  vi.unstubAllEnvs();
  crear.mockReset();
});

describe("recepción durable", () => {
  it("valida el desafío, rechaza firmas falsas y persiste avisos sin procesarlos en la ruta", async () => {
    vi.stubEnv("ZOOM_WEBHOOK_SECRET_TOKEN", secreto);
    const desafio = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "abc" } });
    expect(await (await POST(peticion(desafio))).json()).toEqual(respuestaValidacionZoom(secreto, "abc"));
    expect((await POST(peticion(cuerpo, false))).status).toBe(401);
    crear.mockResolvedValue({ count: 1 });
    expect((await POST(peticion(cuerpo))).status).toBe(204);
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(JSON.stringify(crear.mock.calls[0])).not.toContain("secret.example");
  });

  it("pide a Zoom reintentar si la base no confirmó el aviso", async () => {
    vi.stubEnv("ZOOM_WEBHOOK_SECRET_TOKEN", secreto);
    crear.mockRejectedValue(new Error("DB caída"));
    expect((await POST(peticion(cuerpo))).status).toBe(503);
    const incompleto = JSON.stringify({ event: "meeting.ended", payload: { object: {} } });
    expect((await POST(peticion(incompleto))).status).toBe(503);
  });
});
