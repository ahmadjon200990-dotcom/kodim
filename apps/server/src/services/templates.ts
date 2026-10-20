import type { FileEntry } from "@exam-ide/shared";

// Boshlang'ich papka shablonlari (CLAUDE.md 5.2). REACT_VITE node_modules siz — o'quvchi `npm install` qiladi.

const html: FileEntry[] = [
  {
    path: "index.html",
    content: `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Imtihon</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <script src="script.js"></script>
  </body>
</html>
`,
  },
  { path: "style.css", content: "" },
  { path: "script.js", content: "" },
];

const reactVite: FileEntry[] = [
  {
    path: "package.json",
    content: `${JSON.stringify(
      {
        name: "imtihon",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" },
        devDependencies: { "@vitejs/plugin-react": "^5.1.0", vite: "^7.2.0" },
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "vite.config.js",
    content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
  },
  {
    path: "index.html",
    content: `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Imtihon</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
  },
  {
    path: "src/main.jsx",
    content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  },
  {
    path: "src/App.jsx",
    content: `export default function App() {
  return <h1>Salom!</h1>;
}
`,
  },
  { path: "src/index.css", content: "" },
];

const vueVite: FileEntry[] = [
  {
    path: "package.json",
    content: `${JSON.stringify(
      {
        name: "imtihon",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { vue: "^3.5.0" },
        devDependencies: { "@vitejs/plugin-vue": "^5.2.0", vite: "^7.2.0" },
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "vite.config.js",
    content: `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({ plugins: [vue()] });
`,
  },
  {
    path: "index.html",
    content: `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Imtihon</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
  },
  {
    path: "src/main.js",
    content: `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
`,
  },
  {
    path: "src/App.vue",
    content: `<template>
  <h1>Salom!</h1>
</template>

<script setup></script>
`,
  },
];

const typescript: FileEntry[] = [
  {
    path: "package.json",
    content: `${JSON.stringify(
      {
        name: "imtihon",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { build: "tsc", start: "node dist/index.js" },
        devDependencies: { typescript: "^5.9.0", "@types/node": "^22.0.0" },
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "tsconfig.json",
    content: `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          strict: true,
          skipLibCheck: true,
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
  },
  { path: "src/index.ts", content: `console.log("Salom!");\n` },
];

const node: FileEntry[] = [
  {
    path: "package.json",
    content: `${JSON.stringify(
      { name: "imtihon", private: true, version: "0.0.0", type: "module", scripts: { start: "node index.js" } },
      null,
      2,
    )}\n`,
  },
  { path: "index.js", content: `console.log("Salom!");\n` },
];

const python: FileEntry[] = [{ path: "main.py", content: `print("Salom!")\n` }];

export const TEMPLATES = {
  EMPTY: [],
  HTML: html,
  REACT_VITE: reactVite,
  VUE_VITE: vueVite,
  TYPESCRIPT: typescript,
  NODE: node,
  PYTHON: python,
} as const satisfies Partial<Record<string, FileEntry[]>>;
