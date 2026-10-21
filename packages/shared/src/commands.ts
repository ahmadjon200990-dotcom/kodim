// Terminal buyruqlari ruxsati (CLAUDE.md 0.3, 0.8.2). O'qituvchi ruxsat etilgan buyruqlarni belgilaydi;
// desktop ilova Enter bosilganda qatorni pty'ga yuborishdan OLDIN shu yerda tekshiradi — har shell o'z sintaksisi bilan.
// Bu fayl tashqi importlarsiz (testlar `node --test` bilan to'g'ridan-to'g'ri ishlaydi).

/** Terminal profillari (VS Code kabi). */
export const SHELL_KINDS = ["powershell", "cmd", "gitbash", "wsl"] as const;
export type ShellKind = (typeof SHELL_KINDS)[number];

export const SHELL_LABELS: Record<ShellKind, string> = {
  powershell: "PowerShell",
  cmd: "Command Prompt",
  gitbash: "Git Bash",
  wsl: "WSL (bash)",
};

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

export type CommandBlockReason = "CHAINING" | "BYPASS" | "INLINE_CODE" | "NOT_ALLOWED" | "EMPTY";

export type CommandVerdict = { ok: true } | { ok: false; reason: CommandBlockReason; message: string };

interface ShellRules {
  /** Zanjirlash, yo'naltirish, subshell va o'zgaruvchi orqali buyruq chaqirish belgilari. */
  chaining: RegExp;
  /** Buyruqning o'zi (birinchi so'z) bo'lsa bloklanadigan so'zlar: boshqa shell, eval, start ... */
  bypass: readonly string[];
}

const SHELLS = ["cmd", "powershell", "pwsh", "sh", "bash", "zsh", "dash", "ksh", "wsl", "wt"];

/**
 * Har shell uchun bloklanadigan sintaksis.
 * - PowerShell: `; & | \` $( @( > <` (`&` — chaqiruv operatori ham), `iex`, `Invoke-Expression`, `Start-Process`, boshqa shell'lar.
 * - cmd: `& && || | > < ^` (`^` — qochirish belgisi orqali aylanib o'tish), `%VAR%`/`!VAR!` orqali buyruq,
 *   `cmd /c`, `start`, `call`, `for`, `powershell`.
 * - bash (Git Bash, WSL): `; & && || | \` $( ) { } > <`, `$VAR`/`${...}` orqali buyruq, `eval exec source . sh -c bash -c`.
 */
const RULES: Record<ShellKind, ShellRules> = {
  powershell: {
    chaining: /[;&|`<>]|\$\(|@\(|\r|\n/,
    bypass: [...SHELLS, "iex", "invoke-expression", "invoke-command", "icm", "start-process", "saps", "start-job", "start", "invoke-item", "ii"],
  },
  cmd: {
    chaining: /[&|<>^]|%[^%\s]+%|![^!\s]+!|\r|\n/,
    bypass: [...SHELLS, "start", "call", "for", "forfiles", "wmic", "rundll32", "mshta", "runas"],
  },
  gitbash: {
    chaining: /[;&|`<>(){}]|\$\(|\$\{|\$[A-Za-z_]|\r|\n/,
    bypass: [...SHELLS, "eval", "exec", "source", ".", "env", "xargs", "nohup", "command", "builtin", "start", "winpty"],
  },
  wsl: {
    chaining: /[;&|`<>(){}]|\$\(|\$\{|\$[A-Za-z_]|\r|\n/,
    bypass: [...SHELLS, "eval", "exec", "source", ".", "env", "xargs", "nohup", "command", "builtin", "sudo", "su"],
  },
};

/**
 * Ruxsat etilgan interpretator ichida matnni kod sifatida bajarish (`node -e`, `python -c`, `npx -c` ...).
 * Bu orqali istalgan dastur ishga tushirilishi yoki internetdan yuklab olinishi mumkin edi.
 */
const INLINE_CODE =
  /^\s*(node|nodejs|deno|bun)(\.exe)?(\s+-\S+)*\s+(-e|--eval|-p|--print|-r|--require|--import)(=|\s|$)|^\s*(python3?|py)(\.exe)?(\s+-\S+)*\s+-c(\s|$)|^\s*(npx|npm\s+exec)(\s+-\S+)*\s+(-c|--call)(=|\s|$)/i;

const MSG: Record<CommandBlockReason, string> = {
  CHAINING: "Buyruqlarni birlashtirish, yo'naltirish yoki o'zgaruvchi orqali chaqirish (; && | > $( ) va h.k.) ruxsat etilmagan.",
  BYPASS: "Bu yo'l bilan buyruq ishga tushirish (boshqa shell, eval, start va h.k.) ruxsat etilmagan.",
  INLINE_CODE: "Kodni buyruq qatorida bajarish (node -e, python -c) ruxsat etilmagan. Kodni faylga yozib, faylni ishga tushiring.",
  NOT_ALLOWED: "Bu buyruq imtihonda ruxsat etilmagan. O'qituvchi ruxsat bergan buyruqlardan foydalaning.",
  EMPTY: "",
};

const firstWord = (s: string) =>
  (s.trim().split(/\s+/)[0] ?? "")
    .toLowerCase()
    .replace(/\.(exe|cmd|bat)$/, "");

function matchesPattern(line: string, pattern: string): boolean {
  const words = pattern.trim().toLowerCase().split(/\s+/);
  const lineWords = line.trim().toLowerCase().split(/\s+/);
  return words.every((w, i) => (i === 0 ? lineWords[0]?.replace(/\.(exe|cmd|bat)$/, "") : lineWords[i]) === w);
}

/**
 * Qatorni tekshiradi. `allowed` — o'qituvchi ruxsat etgan naqshlar, `shell` — qaysi terminal profilida.
 * Ruxsat etilgan buyruq ichida ham zanjirlash/aylanib o'tish bo'lsa — bloklanadi.
 */
export function checkCommand(rawLine: string, allowed: readonly string[], shell: ShellKind = "powershell"): CommandVerdict {
  const line = rawLine.trim();
  if (!line) return { ok: false, reason: "EMPTY", message: MSG.EMPTY };
  const rules = RULES[shell];
  const block = (reason: CommandBlockReason): CommandVerdict => ({ ok: false, reason, message: MSG[reason] });
  if (rules.chaining.test(line)) return block("CHAINING");
  if (INLINE_CODE.test(line)) return block("INLINE_CODE");
  const allowedPattern = allowed.some((p) => matchesPattern(line, p));
  const first = firstWord(line);
  const builtin = (ALWAYS_ALLOWED as readonly string[]).includes(first);
  // Aylanib o'tish: buyruqning O'ZI boshqa shell/eval/start bo'lsa — o'qituvchi aynan shuni ruxsat etmagan bo'lsa bloklanadi.
  // Argument sifatida (masalan `npm run start`) — zararsiz.
  if (rules.bypass.includes(first) && !allowedPattern) return block("BYPASS");
  if (builtin || allowedPattern) return { ok: true };
  return block("NOT_ALLOWED");
}

/** Shell uchun imtihonda ruxsat bormi (`allowedShells` bo'sh bo'lsa — hammasi). */
export function isShellAllowed(shell: ShellKind, allowedShells: readonly string[] | undefined): boolean {
  return !allowedShells || allowedShells.length === 0 || allowedShells.includes(shell);
}
