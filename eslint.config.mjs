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
      "sonarjs/cognitive-complexity": ["error", 12],
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 100, skipBlankLines: true, skipComments: true }],
      "no-nested-ternary": "error",
      "no-warning-comments": ["error", { terms: ["todo", "fixme", "hack", "xxx"], location: "anywhere" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "sonarjs/no-duplicate-string": "error",
      "sonarjs/todo-tag": "error"
    }
  },
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
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
