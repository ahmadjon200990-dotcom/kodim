import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

// shared paketi manba kodidan bundle qilinadi (dist kerak emas, ESM/CJS muammosi yo'q).
const alias = { "@exam-ide/shared": resolve(__dirname, "../../packages/shared/src/index.ts") };
const externalizeDeps = { exclude: ["@exam-ide/shared"] };

// Server manzili build vaqtida beriladi: SERVER_URL=https://... pnpm --filter @exam-ide/desktop build
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:8080";

/** Production'da qat'iy CSP (dev'da Vite HMR inline skript ishlatadi). */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "worker-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "kodim-csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig({
  main: {
    resolve: { alias },
    define: { __SERVER_URL__: JSON.stringify(SERVER_URL) },
    build: { externalizeDeps },
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps,
      // Asosiy oyna va ichki brauzer uchun alohida preload.
      rolldownOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          browser: resolve(__dirname, "src/preload/browser.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), contentSecurityPolicy()],
  },
});
