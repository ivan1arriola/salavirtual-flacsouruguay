import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const MOBILE_TOKEN_VERSION = 1;
const MOBILE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export type MobileRole = "ASISTENTE_TECNICO" | "ADMINISTRACION";

export type MobileTokenPayload = Readonly<{
  sub: string;
  role: MobileRole;
  iat: number;
  exp: number;
  v: 1 | 2;
  sid?: string;
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

function isMobileRole(value: unknown): value is MobileRole {
  return value === "ASISTENTE_TECNICO" || value === "ADMINISTRACION";
}

function validPayload(value: unknown, nowSeconds: number): value is MobileTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    (payload.v === MOBILE_TOKEN_VERSION || (payload.v === 2 && typeof payload.sid === "string" && payload.sid.length >= 24)) &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    isMobileRole(payload.role) &&
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
  ttlSeconds = MOBILE_TOKEN_TTL_SECONDS,
  role: MobileRole = "ASISTENTE_TECNICO",
  sessionId?: string
): TokenIssueResult {
  if (!userId) throw new Error("No se puede emitir un token sin usuario.");
  if (secret.length < 32) throw new Error("El secreto de autenticación es inválido.");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("La duración del token es inválida.");

  const payload: MobileTokenPayload = {
    sub: userId,
    role,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    v: sessionId ? 2 : MOBILE_TOKEN_VERSION,
    ...(sessionId ? { sid: sessionId } : {})
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

export function issueMobileToken(userId: string, secret: string, role: MobileRole = "ASISTENTE_TECNICO"): TokenIssueResult & { sessionId: string } {
  const sessionId = randomBytes(32).toString("base64url");
  return { ...signMobileToken(userId, secret, undefined, undefined, role, sessionId), sessionId };
}

export function mobileSessionIdentifier(userId: string): string {
  return "mobile-session:" + userId;
}

export function mobileSessionHash(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

export function issueAssistantMobileToken(userId: string, secret: string): TokenIssueResult {
  return issueMobileToken(userId, secret);
}

export function mobileActorFromRequest(request: Request, secret: string): MobileTokenPayload | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) return null;
  return verifyMobileToken(match[1], secret);
}
