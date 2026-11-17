import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  EVENTOS_ZOOM,
  interpretarAvisoZoom,
  interpretarAvisoAdicionalZoom,
  respuestaValidacionZoom,
  verificarFirmaWebhookZoom
} from "@/src/integrations/zoom/zoom-webhook";

import { interpretarMovimientoReunionZoom } from "@/src/integrations/zoom/zoom-agenda";
import { registrarMovimientoReunionZoom } from "@/src/modules/operaciones/zoom-agenda-observada.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// recording.completed puede incluir muchos archivos; se descartan antes de persistir el aviso.
const MAX_BYTES = 1024 * 1024;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

async function leerCuerpo(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }
  const partes: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      partes.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const cuerpo = new Uint8Array(bytes);
  let offset = 0;
  for (const parte of partes) {
    cuerpo.set(parte, offset);
    offset += parte.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(cuerpo);
}

/** Secreto de firma descifrado, o null si no está configurado o no se pudo leer (en ambos casos: 503). */
async function leerSecretoWebhook(): Promise<string | null> {
  try {
    const config = await db.configuracionZoom.findUnique({
      where: { id: "principal" },
      select: { webhookSecretCifrado: true }
    });
    return config?.webhookSecretCifrado
      ? descifrarConfiguracion(config.webhookSecretCifrado).trim() || null
      : null;
  } catch {
    return null;
  }
}

/** Avisos sin procesador específico: se guardan solo sus metadatos; ante la duda Zoom debe reintentar. */
async function guardarAvisoAdicional(cuerpo: string, evento: unknown): Promise<Response> {
  if (EVENTOS_ZOOM.some((tipo) => tipo === evento)) {
    // Los cuatro eventos existentes conservan su validación y procesamiento especializado.
    return new Response(null, { status: 503, headers: HEADERS });
  }
  const adicional = interpretarAvisoAdicionalZoom(cuerpo);
  if (!adicional) {
    const familia = typeof evento === "string" && /^(meeting|recording|group)\./.test(evento);
    return new Response(null, { status: familia ? 503 : 204, headers: HEADERS });
  }
  try {
    await db.eventoWebhookZoomAdicional.createMany({ data: [adicional], skipDuplicates: true });
    // Altas, cambios y bajas de reuniones alimentan la agenda observada; es idempotente, así que
    // si falla se responde 503 y Zoom reintenta sin duplicar nada.
    const movimiento = /^meeting\.(created|updated|deleted)$/.test(adicional.tipo)
      ? interpretarMovimientoReunionZoom(cuerpo)
      : null;
    if (movimiento) {
      await registrarMovimientoReunionZoom(db, movimiento);
    }
    return new Response(null, { status: 204, headers: HEADERS });
  } catch {
    return new Response(null, { status: 503, headers: HEADERS });
  }
}

export async function POST(request: Request): Promise<Response> {
  const secreto = await leerSecretoWebhook();
  if (!secreto) {
    return new Response(null, { status: 503, headers: HEADERS });
  }
  if (Number(request.headers.get("content-length")) > MAX_BYTES) {
    return new Response(null, { status: 413, headers: HEADERS });
  }
  let cuerpo: string | null;
  try {
    cuerpo = await leerCuerpo(request);
  } catch {
    return new Response(null, { status: 400, headers: HEADERS });
  }
  if (cuerpo === null) {
    return new Response(null, { status: 413, headers: HEADERS });
  }
  if (
    !verificarFirmaWebhookZoom(
      secreto,
      cuerpo,
      request.headers.get("x-zm-request-timestamp"),
      request.headers.get("x-zm-signature"),
      new Date()
    )
  ) {
    return new Response(null, { status: 401, headers: HEADERS });
  }
  let datos: unknown;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return new Response(null, { status: 400, headers: HEADERS });
  }
  const aviso = datos as { event?: unknown; payload?: { plainToken?: unknown } };
  if (aviso?.event === "endpoint.url_validation") {
    const plainToken = aviso.payload?.plainToken;
    if (typeof plainToken !== "string" || !plainToken || plainToken.length > 256) {
      return new Response(null, { status: 400, headers: HEADERS });
    }
    return Response.json(respuestaValidacionZoom(secreto, plainToken), { headers: HEADERS });
  }
  const evento = interpretarAvisoZoom(cuerpo);
  if (!evento) {
    return guardarAvisoAdicional(cuerpo, aviso?.event);
  }
  try {
    await db.eventoWebhookZoom.createMany({
      data: [{ ...evento, estado: "RECIBIDO", proximoIntentoAt: new Date() }],
      skipDuplicates: true
    });
    return new Response(null, { status: 204, headers: HEADERS });
  } catch {
    // Sin confirmación durable Zoom debe reintentar; jamás confirmar un aviso que se perdió.
    return new Response(null, { status: 503, headers: HEADERS });
  }
}
