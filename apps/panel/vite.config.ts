import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Panel server tomonidan statik beriladi (build → apps/server/public). Dev'da proxy orqali API va socket.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@exam-ide/shared/tokens.css", replacement: resolve(__dirname, "../../packages/shared/design/tokens.css") },
      { find: /^@exam-ide\/shared$/, replacement: resolve(__dirname, "../../packages/shared/src/index.ts") },
    ],
  },
  build: {
    outDir: resolve(__dirname, "../server/public"),
    emptyOutDir: true,
  },
  server: {
    port: 5273,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/socket.io": { target: "http://localhost:8080", ws: true, changeOrigin: true },
    },
  },
});
