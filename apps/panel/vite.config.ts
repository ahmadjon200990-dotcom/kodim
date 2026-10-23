import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Panel — statik SPA (Vercel, MIGRATION-PLAN.md 7-bo'lim); backend — Supabase (lib/supabase.ts).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@exam-ide/shared/tokens.css", replacement: resolve(__dirname, "../../packages/shared/design/tokens.css") },
      { find: /^@exam-ide\/shared$/, replacement: resolve(__dirname, "../../packages/shared/src/index.ts") },
    ],
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5273,
  },
});
