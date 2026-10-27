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
    target: "es2022",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("monaco-editor")) return "monaco";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react-router") || id.includes("react-dom") || id.includes("react")) return "react-vendor";
          if (id.includes("exceljs") || id.includes("jszip")) return "data-vendor";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5273,
  },
});
