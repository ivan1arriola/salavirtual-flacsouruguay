import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, ".")
    }
  },
  test: {
    environment: "node",
    env: {
      CONFIG_ENCRYPTION_KEY: "0123456789abcdef".repeat(4)
    },
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "src/modules/**/*.domain.ts",
        "src/modules/usuarios/roles.ts",
        "src/modules/meet/google-api-retry.adapter.ts",
        "src/modules/meet/provisionar-eventos.service.ts",
        "src/modules/configuracion/google-workspace-test.adapter.ts",
        "src/modules/asistencia/asignacion-sugerencias.service.ts",
        "src/modules/usuarios/estado-asistente.service.ts",
        "src/lib/http/api-error.ts",
        "src/lib/ui/*.ts",
        "src/lib/config/encryption.ts"
      ],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 90
      }
    }
  }
});
