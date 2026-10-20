// Ish papkasi qoidalari: desktop (watcher, sync) va server (sync tekshiruvi) uchun umumiy.

export const QUESTIONS_FILE = "savollar.md";
export const DESIGNS_DIR = "dizaynlar";

/** `savollar.md` va `dizaynlar/` — faqat o'qish uchun. */
export function isReadonlyPath(path: string): boolean {
  return path === QUESTIONS_FILE || path === DESIGNS_DIR || path.startsWith(`${DESIGNS_DIR}/`);
}

export const IGNORED_DIRS = ["node_modules", ".git", "dist", "build", ".vite"] as const;
export const IGNORED_FILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"] as const;

/** Sync va watcher e'tiborga olmaydigan yo'llar (yo'l `/` bilan ajratilgan, nisbiy). */
export function isIgnoredPath(path: string): boolean {
  const parts = path.split("/");
  const base = parts[parts.length - 1] ?? "";
  return (
    parts.some((p) => (IGNORED_DIRS as readonly string[]).includes(p)) ||
    (IGNORED_FILES as readonly string[]).includes(base)
  );
}

export const SYNC_LIMITS = {
  maxFileBytes: 1024 * 1024,
  maxFiles: 300,
  intervalMs: 5000,
} as const;

/** Topshirilgan ish papkasi nomi: "Ali Valiyev" → "Ali_Valiyev" (Windows uchun yaroqli). */
export function studentFolderName(name: string): string {
  const safe = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[<>:"/\\|?*]/g, "")
    .split("")
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("")
    .replace(/[. ]+$/, "");
  return safe || "oquvchi";
}

/** Bir xil ismlar uchun: "Ali_Valiyev", "Ali_Valiyev_2", ... */
export function uniqueFolderNames(names: readonly string[]): string[] {
  const used = new Map<string, number>();
  return names.map((n) => {
    const base = studentFolderName(n);
    const key = base.toLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}
