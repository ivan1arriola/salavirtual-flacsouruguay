import { z } from "zod";

const authEnvironmentSchema = z.object({
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET debe tener al menos 32 caracteres."),
  AUTH_TRUST_HOST: z.enum(["true", "false"]),
  APP_BASE_URL: z.url()
});

export type AuthEnvironment = Readonly<{
  AUTH_SECRET: unknown;
  AUTH_TRUST_HOST: unknown;
  APP_BASE_URL: unknown;
}>;

export type AuthConfig = Readonly<{
  secret: string;
  trustHost: boolean;
  baseUrl: string;
}>;

export function parseAuthConfig(environment: AuthEnvironment): AuthConfig {
  const parsed = authEnvironmentSchema.parse(environment);

  return {
    secret: parsed.AUTH_SECRET,
    trustHost: parsed.AUTH_TRUST_HOST === "true",
    baseUrl: parsed.APP_BASE_URL
  };
}
