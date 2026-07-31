import { parseAuthConfig } from "@/src/modules/usuarios/auth-config.domain";

export const authConfig = parseAuthConfig({
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  APP_BASE_URL: process.env.APP_BASE_URL,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET
});
