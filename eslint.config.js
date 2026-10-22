import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/out/**", "**/build/**", "**/node_modules/**", "**/release/**", "apps/server/public/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Sinov skriptlari (Node, ESM).
    files: ["**/scripts/**/*.mjs", "**/scripts/**/*.cjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", fetch: "readonly", WebSocket: "readonly", setTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", require: "readonly", __dirname: "readonly", module: "readonly", Buffer: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Landing: brauzer skripti.
    files: ["apps/landing/src/**/*.js"],
    languageOptions: { globals: { document: "readonly", fetch: "readonly", window: "readonly" } },
  },
  {
    files: ["apps/landing/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
