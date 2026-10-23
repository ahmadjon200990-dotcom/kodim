import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

// shared paketi manba kodidan bundle qilinadi (dist kerak emas, ESM/CJS muammosi yo'q).
const alias = { "@exam-ide/shared": resolve(__dirname, "../../packages/shared/src/index.ts") };
const externalizeDeps = { exclude: ["@exam-ide/shared"] };

// Supabase manzili va publishable kaliti build vaqtida (MIGRATION-PLAN.md 4-bo'lim): SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=...
// Standart — shared/supabaseConfig.ts (loyiha "kodim").
const SERVER_URL = process.env.SUPABASE_URL ?? "https://prkrhitgkjyuwyipqimw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_SrliT3-Dc98IWucZ1Zt_hg_5AXtIOQf";

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
    define: { __SERVER_URL__: JSON.stringify(SERVER_URL), __SUPABASE_KEY__: JSON.stringify(SUPABASE_KEY) },
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
