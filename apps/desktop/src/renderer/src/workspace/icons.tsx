// Fayl/papka ikonkalari — VS Code (Seti) uslubiga yaqin, yengil SVG to'plam.
// To'liq vscode-icons shriftini bundle qilmaymiz (og'ir); tez-tez uchraydigan turlar uchun rangli glif.
import type { JSX } from "react";

const COLORS: Record<string, string> = {
  html: "#e37933",
  htm: "#e37933",
  css: "#4fc1e9",
  scss: "#cd6799",
  sass: "#cd6799",
  less: "#2a6db5",
  js: "#e8d44d",
  mjs: "#e8d44d",
  cjs: "#e8d44d",
  jsx: "#4fc1e9",
  ts: "#4a90d9",
  tsx: "#4fc1e9",
  json: "#cbcb41",
  md: "#5a9ccf",
  py: "#4b8bbe",
  vue: "#41b883",
  svg: "#ffb13b",
  png: "#a074c4",
  jpg: "#a074c4",
  jpeg: "#a074c4",
  gif: "#a074c4",
  webp: "#a074c4",
  txt: "#b0b0b0",
  lock: "#9b9b9b",
};

/** Maxsus fayl nomlari uchun rang/belgi. */
const SPECIAL: Record<string, { color: string; label: string }> = {
  "package.json": { color: "#8bc34a", label: "{}" },
  "package-lock.json": { color: "#6b8e3d", label: "{}" },
  "tsconfig.json": { color: "#4a90d9", label: "TS" },
  "vite.config.js": { color: "#bd63c5", label: "V" },
  "vite.config.ts": { color: "#bd63c5", label: "V" },
  ".gitignore": { color: "#e8623c", label: "" },
  "savollar.md": { color: "#5a9ccf", label: "?" },
};

const FOLDER_COLORS: Record<string, string> = {
  node_modules: "#8bc34a",
  src: "#4fc1e9",
  public: "#e8a33d",
  dist: "#9b9b9b",
  build: "#9b9b9b",
  dizaynlar: "#ffb13b",
  components: "#4fc1e9",
  pages: "#cd6799",
  assets: "#e8a33d",
};

function extOf(name: string): string {
  const base = name.toLowerCase();
  if (base.endsWith(".config.js") || base.endsWith(".config.ts")) return base.slice(base.lastIndexOf(".") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

const LANG_LABEL: Record<string, string> = {
  html: "<>",
  css: "#",
  scss: "#",
  js: "JS",
  jsx: "JS",
  ts: "TS",
  tsx: "TS",
  json: "{}",
  md: "M",
  py: "PY",
  vue: "V",
};

export function FileIcon({ name }: { name: string }): JSX.Element {
  const lower = name.toLowerCase();
  const special = SPECIAL[lower];
  const ext = extOf(lower);
  const color = special?.color ?? COLORS[ext] ?? "#8a9199";
  const label = special?.label ?? LANG_LABEL[ext] ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"].includes(ext);

  if (isImage) {
    return (
      <svg className="ficon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke={color} strokeWidth="1.2" />
        <circle cx="5.5" cy="6" r="1.2" fill={color} />
        <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="ficon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 1.5h6l3 3v10a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" fill={color} opacity="0.22" />
      <path d="M3.5 1.5h6l3 3v10a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" fill="none" stroke={color} strokeWidth="1" opacity="0.9" />
      <path d="M9.5 1.5v3h3" fill="none" stroke={color} strokeWidth="1" />
      {label && (
        <text x="8" y="12" textAnchor="middle" fontSize="5.4" fontWeight="700" fill={color} fontFamily="Consolas, monospace">
          {label}
        </text>
      )}
    </svg>
  );
}

export function FolderIcon({ name, open }: { name: string; open: boolean }): JSX.Element {
  const color = FOLDER_COLORS[name.toLowerCase()] ?? "#90a4ae";
  return (
    <svg className="ficon" viewBox="0 0 16 16" aria-hidden="true">
      {open ? (
        <path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.2 1.2h6.3a1 1 0 0 1 1 1v1H3.2L1.5 11z" fill={color} opacity="0.9" />
      ) : (
        <path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.3 1.3h6.5a1 1 0 0 1 1 1V12a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 1.5 12z" fill={color} opacity="0.9" />
      )}
      {open && <path d="M3.2 6.5h11.3L13 12H1.8z" fill={color} opacity="0.55" />}
    </svg>
  );
}
