import { z } from "zod";
import type { AuthConfig } from "./identity.types";

const optionalCredential = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);

const authEnvironmentSchema = z
  .object({
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET debe tener al menos 32 caracteres."),
    AUTH_TRUST_HOST: z.enum(["true", "false"]),
    APP_BASE_URL: z.string().url(),
    AUTH_GOOGLE_ID: optionalCredential,
    AUTH_GOOGLE_SECRET: optionalCredential
  })
  .refine(
    (value) => Boolean(value.AUTH_GOOGLE_ID) === Boolean(value.AUTH_GOOGLE_SECRET),
    "AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET deben configurarse juntos."
  );

export type AuthEnvironment = Readonly<{
  AUTH_SECRET: unknown;
  AUTH_TRUST_HOST: unknown;
  APP_BASE_URL: unknown;
  AUTH_GOOGLE_ID?: unknown;
  AUTH_GOOGLE_SECRET?: unknown;
}>;

export function parseAuthConfig(environment: AuthEnvironment): AuthConfig {
  const parsed = authEnvironmentSchema.parse(environment);

  return {
    secret: parsed.AUTH_SECRET,
    trustHost: parsed.AUTH_TRUST_HOST === "true",
    baseUrl: parsed.APP_BASE_URL,
    google:
      parsed.AUTH_GOOGLE_ID && parsed.AUTH_GOOGLE_SECRET
        ? {
            clientId: parsed.AUTH_GOOGLE_ID,
            clientSecret: parsed.AUTH_GOOGLE_SECRET
          }
        : null
  };
}

export function resolverRedireccionAutorizada(url: string, baseUrl: string): string {
  const destino = new URL(url, baseUrl);
  const base = new URL(baseUrl);

  return destino.origin === base.origin ? destino.toString() : base.toString();
}
