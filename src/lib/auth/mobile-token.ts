import { createHmac, timingSafeEqual } from "node:crypto";

const MOBILE_TOKEN_VERSION = 1;
const MOBILE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export type MobileTokenPayload = Readonly<{
  sub: string;
  role: "ASISTENTE_TECNICO";
  iat: number;
  exp: number;
  v: 1;
}>;

type TokenIssueResult = Readonly<{
  accessToken: string;
  expiresAt: string;
}>;

function signature(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function encodePayload(payload: MobileTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function validPayload(value: unknown, nowSeconds: number): value is MobileTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.v === MOBILE_TOKEN_VERSION &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    payload.role === "ASISTENTE_TECNICO" &&
    typeof payload.iat === "number" &&
    Number.isInteger(payload.iat) &&
    payload.iat <= nowSeconds + 300 &&
    typeof payload.exp === "number" &&
    Number.isInteger(payload.exp) &&
    payload.exp > nowSeconds
  );
}

export function signMobileToken(
  userId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = MOBILE_TOKEN_TTL_SECONDS
): TokenIssueResult {
  if (!userId) throw new Error("No se puede emitir un token sin usuario.");
  if (secret.length < 32) throw new Error("El secreto de autenticación es inválido.");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("La duración del token es inválida.");

  const payload: MobileTokenPayload = {
    sub: userId,
    role: "ASISTENTE_TECNICO",
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    v: MOBILE_TOKEN_VERSION
  };
  const encoded = encodePayload(payload);
  const signed = signature(encoded, secret).toString("base64url");

  return {
    accessToken: `${encoded}.${signed}`,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
}

export function verifyMobileToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): MobileTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, providedSignature] = parts;
  if (!encoded || !providedSignature) return null;

  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = signature(encoded, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    return validPayload(payload, nowSeconds) ? payload : null;
  } catch {
    return null;
  }
}

export function issueAssistantMobileToken(userId: string, secret: string): TokenIssueResult {
  return signMobileToken(userId, secret);
}

export function mobileActorFromRequest(request: Request, secret: string): MobileTokenPayload | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) return null;
  return verifyMobileToken(match[1], secret);
}
