import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  sonarjs.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      "no-debugger": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "sonarjs/cognitive-complexity": ["warn", 20],
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/todo-tag": "off",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/alt-text": "error"
    }
  },
  {
    ignores: [".next/**", ".next-dev/**", ".zoom-worker/**", "coverage/**", "node_modules/**", "generated/**", "prisma/migrations/**", "scripts/legacy-meetings/**"]
  }
]);
