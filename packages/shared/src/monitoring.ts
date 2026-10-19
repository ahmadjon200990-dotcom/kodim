// Kuzatuv qoidalari (CLAUDE.md 5.5). Ro'yxatlar shu yerda sozlanadi.

/** Imtihon paytida ochiq bo'lmasligi kerak bo'lgan dasturlar (Windows jarayon nomlari, kichik harf). */
export const FORBIDDEN_PROCESSES: readonly string[] = [
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "opera.exe",
  "brave.exe",
  "yandex.exe",
  "telegram.exe",
  "discord.exe",
  "whatsapp.exe",
  "code.exe",
  "cursor.exe",
  "windsurf.exe",
  "chatgpt.exe",
  "claude.exe",
  "anydesk.exe",
  "teamviewer.exe",
  "rustdesk.exe",
  "obs64.exe",
];

/** Xavfli terminal buyruqlari (katta-kichik harf farqsiz). Buyruq bloklanmaydi — faqat ogohlantirish. */
export const DANGEROUS_COMMAND_PATTERNS: readonly string[] = [
  "\\bgit\\s+clone\\b",
  "\\bgit\\s+pull\\b",
  "\\bgit\\s+fetch\\b",
  "\\bcurl\\b",
  "\\bwget\\b",
  "\\binvoke-webrequest\\b",
  "\\biwr\\b",
  "\\birm\\b",
  "\\bstart-bitstransfer\\b",
  "\\bbitsadmin\\b",
  "\\bcertutil\\b.*urlcache",
  "\\bdegit\\b",
  "\\bscp\\b",
  "\\bs?ftp\\b",
  "\\bclaude\\b",
  "\\bcodex\\b",
  "\\bgemini\\b",
  "\\bcopilot\\b",
  "\\baider\\b",
  "\\bollama\\b",
  "\\bcursor\\b",
  "(^|[\\s;&|])code(\\s|$)",
  "\\bstart\\s+https?:",
  "\\bexplorer(\\.exe)?\\b",
];

/** Mos kelgan birinchi xavfli naqsh (yoki null). */
export function matchDangerousCommand(line: string): string | null {
  for (const p of DANGEROUS_COMMAND_PATTERNS) {
    if (new RegExp(p, "i").test(line)) return p;
  }
  return null;
}

/**
 * Fayl yaratadigan "xavfsiz" buyruqlar: shundan keyingi 60 soniyadagi fayl o'zgarishlari
 * tashqi o'zgarish hisoblanmaydi (npm create vite, npm install, npm init ...).
 */
const SAFE_COMMAND = /^\s*(npm|pnpm|yarn|npx|bun)(\.cmd)?\s+(create|init|install|i|add|ci|update|up|remove|rm|uninstall|un|run|exec|dlx)\b/i;

export function isSafeFileCommand(line: string): boolean {
  return SAFE_COMMAND.test(line) || /^\s*(mkdir|md|ni|new-item|touch|cp|copy|mv|move|ren|rename|rm|del)\b/i.test(line);
}

export const SAFE_COMMAND_WINDOW_MS = 60_000;

/** `npm i react@18 lodash -D` → ["react", "lodash"]. O'rnatish buyrug'i bo'lmasa — []. */
export function parseInstalledPackages(line: string): string[] {
  const m = /^\s*(npm|pnpm|yarn|bun)(\.cmd)?\s+(install|i|add)\b(.*)$/i.exec(line);
  if (!m) return [];
  return (m[4] ?? "")
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("-"))
    .map((t) => {
      // Versiyani olib tashlash: react@18, @types/react@19.1
      const at = t.startsWith("@") ? t.indexOf("@", 1) : t.indexOf("@");
      return (at > 0 ? t.slice(0, at) : t).toLowerCase();
    })
    .filter((name) => /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name));
}

/** Editorda bitta o'zgarishda shundan ko'p belgi qo'shilsa (ichki paste emas) — LARGE_INSERT. */
export const LARGE_INSERT_CHARS = 200;
export const PROCESS_SCAN_INTERVAL_MS = 5_000;
/** Shundan qisqa fokus yo'qotish xabar qilinmaydi (bildirishnoma kabi tasodifiy holatlar). */
export const FOCUS_LOST_MIN_MS = 1_500;
