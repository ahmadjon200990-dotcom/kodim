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
      globals: { process: "readonly", console: "readonly", fetch: "readonly", WebSocket: "readonly", setTimeout: "readonly", require: "readonly", __dirname: "readonly", module: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
