import { randomBytes, timingSafeEqual } from "node:crypto";
import { CodeChallengeMethod, type OAuth2Client } from "google-auth-library";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  conectarCalendarioZoom,
  configurarOAuthCalendarioZoom,
  desconectarCalendarioZoom,
  rutaCalendarioZoom,
  scopesCalendarioZoom,
  sincronizarCalendarioZoom
} from "@/src/bootstrap/calendario-zoom-asistente.server";
import { authConfig } from "@/src/lib/auth/config";
import { cifrarConfiguracion, descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
export const maxDuration = 90;

const cookieName = "flacso-calendario-zoom-oauth";
const vigencia = 600;
const intentoOAuth = z.object({
  asistenteId: z.string(),
  state: z.string(),
  verifier: z.string(),
  venceAt: z.number()
});

function irAgenda(estado: string) {
  const url = new URL("/mi-agenda", authConfig.baseUrl);
  url.searchParams.set("calendario", estado);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function terminarOAuth(estado: string) {
  const response = irAgenda(estado);
  response.cookies.set(cookieName, "", { path: rutaCalendarioZoom, maxAge: 0 });
  return response;
}

async function obtenerAsistente() {
  const session = await auth();
  if (!session?.user?.id || session.user.mustChangePassword) {
    return null;
  }
  return db.asistenteTecnico.findFirst({
    where: {
      usuarioId: session.user.id,
      usuario: { activo: true, rol: "ASISTENTE_TECNICO", fusionadoEnId: null }
    },
    select: { id: true, calendarioZoom: { select: { asistenteId: true } } }
  });
}

function leerIntento(request: NextRequest) {
  const cookie = request.cookies.get(cookieName)?.value;
  if (!cookie) {
    return null;
  }
  return intentoOAuth.parse(JSON.parse(descifrarConfiguracion(cookie)));
}

function esEstadoValido(recibido: string | null, esperado: string): boolean {
  const valor = Buffer.from(recibido ?? "");
  const referencia = Buffer.from(esperado);
  return valor.length === referencia.length && timingSafeEqual(valor, referencia);
}

export async function GET(request: NextRequest) {
  const client = configurarOAuthCalendarioZoom();
  const asistente = await obtenerAsistente();
  if (!client || !asistente) {
    return terminarOAuth("error");
  }
  try {
    const intento = leerIntento(request);
    const state = request.nextUrl.searchParams.get("state");
    if (!intento || intento.asistenteId !== asistente.id || intento.venceAt < Date.now()) {
      return terminarOAuth("error");
    }
    if (!esEstadoValido(state, intento.state)) {
      return terminarOAuth("error");
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      return terminarOAuth("sin-permiso");
    }
    const conectado = await conectarCalendarioZoom(asistente.id, client, code, intento.verifier);
    return terminarOAuth(conectado ? "conectado" : "error");
  } catch {
    return terminarOAuth("error");
  }
}

async function iniciarOAuth(client: OAuth2Client, id: string) {
  const state = randomBytes(32).toString("base64url");
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: scopesCalendarioZoom(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256
  });
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  const intento = { asistenteId: id, state, verifier: codeVerifier, venceAt: Date.now() + vigencia * 1000 };
  response.cookies.set(cookieName, cifrarConfiguracion(JSON.stringify(intento)), {
    path: rutaCalendarioZoom,
    httpOnly: true,
    sameSite: "lax",
    secure: authConfig.baseUrl.startsWith("https:"),
    maxAge: vigencia
  });
  return response;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(authConfig.baseUrl).origin) {
    return new Response(null, { status: 403 });
  }
  const client = configurarOAuthCalendarioZoom();
  const asistente = await obtenerAsistente();
  if (!client || !asistente) {
    return irAgenda("error");
  }
  try {
    const accion = (await request.formData()).get("accion");
    if (accion === "conectar" && !asistente.calendarioZoom) {
      return await iniciarOAuth(client, asistente.id);
    }
    if (accion === "desconectar") {
      return irAgenda((await desconectarCalendarioZoom(asistente.id, client)) ?? "ocupado");
    }
    if (accion === "sincronizar") {
      return irAgenda((await sincronizarCalendarioZoom(asistente.id, client)) ?? "ocupado");
    }
    return irAgenda("error");
  } catch {
    return irAgenda("error");
  }
}
