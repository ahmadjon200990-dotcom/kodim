import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import type { ShellKind } from "@exam-ide/shared";

// Terminal profillari (CLAUDE.md 0.8.2): kompyuterda mavjud shell'larni aniqlash va ishga tushirish parametrlari.
// Har profil prompt'dan oldin OSC 633;A belgisini chiqaradi — "buyruq tugadi, shell kutmoqda" (busy aniqlash, terminal.ts).

export interface ShellProfile {
  kind: ShellKind;
  file: string;
  args: string[];
  env: Record<string, string>;
}

const sys32 = () => join(process.env.SystemRoot ?? "C:\\Windows", "System32");

/** Git Bash: standart o'rnatish joylari va PATH'dagi git.exe yonidagi bash.exe. */
function findGitBash(): string | null {
  const candidates = [
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
    join(process.env.USERPROFILE ?? "", "scoop", "apps", "git", "current", "bin", "bash.exe"),
  ];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    // ...\Git\cmd yoki ...\Git\bin → ...\Git\bin\bash.exe
    if (/[\\/]git[\\/](cmd|bin|mingw64[\\/]bin)$/i.test(dir)) {
      const root = /mingw64/i.test(dir) ? dirname(dirname(dir)) : dirname(dir);
      candidates.push(join(root, "bin", "bash.exe"));
    }
  }
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

/** WSL: wsl.exe bor va kamida bitta distributiv o'rnatilgan bo'lsa. */
function detectWsl(): Promise<boolean> {
  const exe = join(sys32(), "wsl.exe");
  if (!existsSync(exe)) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(exe, ["-l", "-q"], { windowsHide: true, timeout: 5000, encoding: "buffer" }, (err, stdout) => {
      if (err) return resolve(false);
      // wsl.exe UTF-16LE chiqaradi.
      const text = Buffer.from(stdout).toString("utf16le").replace(/\0/g, "").trim();
      resolve(text.length > 0 && !/not installed|no installed/i.test(text));
    });
  });
}

let cache: Promise<ShellKind[]> | null = null;

/** Kompyuterda mavjud shell'lar (bir marta aniqlanadi). */
export function detectShells(): Promise<ShellKind[]> {
  cache ??= (async () => {
    if (process.platform !== "win32") return ["gitbash"] as ShellKind[];
    const found: ShellKind[] = ["powershell"];
    if (existsSync(process.env.ComSpec ?? join(sys32(), "cmd.exe"))) found.push("cmd");
    if (findGitBash()) found.push("gitbash");
    if (await detectWsl()) found.push("wsl");
    return found;
  })();
  return cache;
}

/** Windows yo'lini Git Bash / WSL yo'liga: C:\Users\a → /c/Users/a yoki /mnt/c/Users/a. */
function posixPath(win: string, prefix: "" | "/mnt"): string {
  const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(win);
  if (!m) return win.replace(/\\/g, "/");
  return `${prefix}/${m[1]!.toLowerCase()}/${m[2]!.replace(/\\/g, "/")}`;
}

/** Bash prompt'i: OSC 633;A + ish papkasiga nisbatan yo'l ("~/src $"). To'liq yo'l ko'rinmaydi. */
function bashPrompt(root: string): string {
  return `\\[\\e]633;A\\a\\]\\[\\e[32m\\]$(p="$PWD"; r="${root}"; case "$p" in "$r"*) echo "~\${p#$r}";; *) echo "$p";; esac)\\[\\e[0m\\] \\$ `;
}

export function shellProfile(kind: ShellKind, cwd: string): ShellProfile | null {
  if (process.platform !== "win32") {
    return { kind, file: process.env.SHELL ?? "bash", args: ["--noprofile", "--norc", "-i"], env: { PS1: bashPrompt(cwd) } };
  }
  if (kind === "powershell") {
    const prompt =
      "function global:prompt { $p = (Get-Location).Path; $r = $env:KODIM_ROOT; " +
      "if ($p.StartsWith($r)) { $p = '~' + $p.Substring($r.Length) }; \"$([char]27)]633;A$([char]7)PS $p> \" }";
    return {
      kind,
      file: join(sys32(), "WindowsPowerShell", "v1.0", "powershell.exe"),
      args: ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", prompt],
      env: {},
    };
  }
  if (kind === "cmd") {
    // cmd prompt'ida $E — ESC; OSC ST (ESC \) bilan yopiladi. Yo'l to'liq ko'rinadi ($P) — cmd boshqa imkon bermaydi.
    return { kind, file: process.env.ComSpec ?? join(sys32(), "cmd.exe"), args: ["/Q", "/K"], env: { PROMPT: "$E]633;A$E\\$P$G" } };
  }
  if (kind === "gitbash") {
    const bash = findGitBash();
    if (!bash) return null;
    // --noprofile --norc: foydalanuvchi .bashrc dagi alias/funksiyalar ruxsat tekshiruvini aylanib o'tmasin.
    return {
      kind,
      file: bash,
      args: ["--noprofile", "--norc", "-i"],
      env: { PS1: bashPrompt(posixPath(cwd, "")), CHERE_INVOKING: "1", MSYSTEM: "MINGW64", HISTFILE: "/dev/null" },
    };
  }
  // WSL: o'zgaruvchilar WSLENV orqali o'tkaziladi.
  return {
    kind,
    file: join(sys32(), "wsl.exe"),
    args: ["--cd", cwd, "--exec", "bash", "--noprofile", "--norc", "-i"],
    env: { PS1: bashPrompt(posixPath(cwd, "/mnt")), HISTFILE: "/dev/null", WSLENV: "PS1/u:HISTFILE/u:BROWSER/u" },
  };
}
