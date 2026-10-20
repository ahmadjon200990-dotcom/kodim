// Terminal buyruqlari ruxsati (CLAUDE.md 3-bo'lim). O'qituvchi ruxsat etilgan buyruqlarni belgilaydi;
// desktop ilova Enter bosilganda qatorni pty'ga yuborishdan OLDIN shu yerda tekshiradi.

/** Har doim ruxsat etilgan zararsiz ichki buyruqlar (navigatsiya, ro'yxat). */
export const ALWAYS_ALLOWED = [
  "cls",
  "clear",
  "ls",
  "dir",
  "cd",
  "pwd",
  "echo",
  "cat",
  "type",
  "mkdir",
  "md",
  "exit",
] as const;

/**
 * Buyruq naqshi: bir yoki bir nechta boshlang'ich so'z (bo'sh joy bilan).
 * Qator shu so'zlar bilan boshlansa (katta-kichik harf farqsiz) — ruxsat.
 */
export interface CommandPreset {
  id: string;
  label: string;
  commands: string[];
  /** Shu to'plam bilan birga keladigan ruxsat etilgan paketlar. */
  packages?: string[];
}

export const COMMAND_PRESETS: readonly CommandPreset[] = [
  {
    id: "frontend",
    label: "Frontend (npm, Vite)",
    commands: ["npm install", "npm i", "npm ci", "npm run", "npm create vite", "npx vite", "npx", "node"],
    packages: ["react", "react-dom", "vue", "axios", "vite", "@vitejs/plugin-react", "sass"],
  },
  {
    id: "node",
    label: "Node.js",
    commands: ["node", "npm install", "npm i", "npm run", "npm init", "npm test"],
    packages: ["express", "nodemon", "dotenv"],
  },
  {
    id: "python",
    label: "Python",
    commands: ["python", "python3", "py", "pip install", "pip3 install"],
    packages: [],
  },
];

/** Standart ruxsat etilgan buyruqlar (yangi imtihon uchun). */
export const DEFAULT_ALLOWED_COMMANDS: string[] = [...COMMAND_PRESETS[0]!.commands];

/**
 * Zanjirlash va aylanib o'tish belgilari — ruxsat etilgan buyruq bo'lsa ham bloklanadi.
 * (`;` `&&` `||` `|` backtick `$(` `>` `<` `&`), hamda matn ichidagi aylanma chaqiruvlar.
 */
const CHAINING = /[;&|`]|\$\(|\|\||&&|>>?|<|(^|\s)&(\s|$)/;
const BYPASS_WORDS = /\b(iex|invoke-expression|cmd|powershell|pwsh|start|start-process|saps|sh|bash|wsl)\b/i;

export type CommandVerdict =
  | { ok: true }
  | { ok: false; reason: "CHAINING" | "BYPASS" | "NOT_ALLOWED" | "EMPTY"; message: string };

const MSG = {
  CHAINING: "Buyruqlarni birlashtirish yoki yo'naltirish (; && | > va h.k.) ruxsat etilmagan.",
  BYPASS: "Bu yo'l bilan buyruq ishga tushirish ruxsat etilmagan.",
  NOT_ALLOWED: "Bu buyruq imtihonda ruxsat etilmagan. O'qituvchi ruxsat bergan buyruqlardan foydalaning.",
  EMPTY: "",
};

const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

function matchesPattern(line: string, pattern: string): boolean {
  const words = pattern.trim().toLowerCase().split(/\s+/);
  const lineWords = line.trim().toLowerCase().split(/\s+/);
  return words.every((w, i) => lineWords[i] === w);
}

/**
 * Qatorni tekshiradi. `allowed` — o'qituvchi ruxsat etgan naqshlar.
 * Ruxsat etilgan buyruq ichida ham zanjirlash/aylanib o'tish bo'lsa — bloklanadi.
 */
export function checkCommand(rawLine: string, allowed: readonly string[]): CommandVerdict {
  const line = rawLine.trim();
  if (!line) return { ok: false, reason: "EMPTY", message: MSG.EMPTY };
  if (CHAINING.test(line)) return { ok: false, reason: "CHAINING", message: MSG.CHAINING };
  if (BYPASS_WORDS.test(` ${line} `)) {
    // Faqat ruxsat etilgan ro'yxatda aynan shu bo'lsa o'tkazamiz (masalan "python" kabi bo'lsa bu yerga tushmaydi).
    const allowedFirst = allowed.some((p) => matchesPattern(line, p));
    if (!allowedFirst) return { ok: false, reason: "BYPASS", message: MSG.BYPASS };
  }
  const first = firstWord(line);
  if ((ALWAYS_ALLOWED as readonly string[]).includes(first)) return { ok: true };
  if (allowed.some((p) => matchesPattern(line, p))) return { ok: true };
  return { ok: false, reason: "NOT_ALLOWED", message: MSG.NOT_ALLOWED };
}
