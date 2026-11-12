import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  sonarjs.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      "no-debugger": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: ["error", "all"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "sonarjs/cognitive-complexity": ["error", 20],
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/todo-tag": "off"
    }
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "@next/next/no-img-element": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/alt-text": ["error", { elements: ["img"], img: ["Image"] }]
    }
  },
  {
    files: ["scripts/**/*.{ts,mjs}"],
    rules: {
      // Los scripts administrativos escriben resultados y resúmenes a stdout.
      "no-console": "off"
    }
  },
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      ".worktrees/**",
      ".zoom-worker/**",
      "coverage/**",
      "node_modules/**",
      "generated/**",
      "prisma/migrations/**",
      "scripts/legacy-meetings/**"
    ]
  }
]);
