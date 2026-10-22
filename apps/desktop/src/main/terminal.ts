import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as pty from "node-pty";
import type { ShellKind } from "@exam-ide/shared";
import { shellProfile } from "./shells";

// Terminal (CLAUDE.md 3, 0.8.2): node-pty + tanlangan profil (PowerShell, cmd, Git Bash, WSL), ish papkasida.
// Kiritish qatorini ilova boshqaradi — buyruq pty'ga YUBORILISHIDAN OLDIN ruxsat tekshiriladi (ipc.ts).
// Jarayon ishlayotganda (busy) kiritma to'g'ridan-to'g'ri o'tadi (interaktiv savollar uchun).

export interface CommandInfo {
  line: string;
  terminalId: number;
}

interface Term {
  kind: ShellKind;
  proc: pty.IPty;
  cwd: string;
  busy: boolean;
  /** Oldingi bo'lak oxiri — prompt belgisi ikki bo'lakka bo'linib kelsa ham topilsin. */
  carry: string;
}

export interface TerminalEvents {
  data(id: number, data: string): void;
  exit(id: number, code: number): void;
  busy(id: number, busy: boolean): void;
}

const MAX_TERMINALS = 5;
/**
 * Prompt oldidan chiqadigan ko'rinmas belgi (OSC 633;A — VS Code shell integration kabi).
 * ConPTY uni o'tkazadi va faqat YANGI prompt chiqqanda yuboradi (ekranni qayta chizishda emas),
 * shuning uchun "buyruq tugadi, shell kutmoqda" holatini ishonchli bildiradi. Avvalgi "PS ...>" matnini
 * qidirish ConPTY qayta chizganda xato ishlardi (masalan `node` REPL'da kiritma buyruq deb bloklanardi).
 */
const PROMPT_MARK = "\x1b]633;A"; // BEL (PowerShell, bash) yoki ESC \ (cmd) bilan yopiladi

export class Terminals {
  private readonly terms = new Map<number, Term>();
  private nextId = 1;

  constructor(private readonly events: TerminalEvents) {}

  /** `null` — terminallar soni chegarada; `undefined` — bu shell kompyuterda yo'q. */
  create(kind: ShellKind, cwd: string, cols: number, rows: number): number | null | undefined {
    if (this.terms.size >= MAX_TERMINALS) return null;
    processLister.warm();
    const profile = shellProfile(kind, cwd);
    if (!profile) return undefined;
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !k.startsWith("ELECTRON_")) env[k] = v;
    }
    env.BROWSER = "none";
    env.KODIM_ROOT = cwd;
    Object.assign(env, profile.env);
    const proc = pty.spawn(profile.file, profile.args, {
      name: "xterm-256color",
      cols: clamp(cols, 20, 500),
      rows: clamp(rows, 5, 200),
      cwd,
      env,
    });
    const id = this.nextId++;
    const term: Term = { kind, proc, cwd, busy: false, carry: "" };
    this.terms.set(id, term);
    proc.onData((data) => {
      this.events.data(id, data);
      this.observe(id, term, data);
    });
    proc.onExit(({ exitCode }) => {
      this.terms.delete(id);
      this.events.exit(id, exitCode);
    });
    return id;
  }

  /** Jarayon ishlayaptimi (busy) — kiritma raw yuboriladi. */
  isBusy(id: number): boolean {
    return this.terms.get(id)?.busy ?? false;
  }

  /**
   * Busy belgisini haqiqiy holat bilan solishtiradi: shell'ning (shell bo'lmagan) bola jarayoni yo'q bo'lsa,
   * dastur tugagan — prompt belgisi kechikkan/yo'qolgan. Aks holda raw yuborilgan qator jarayon tugagach shell'ga
   * TEKSHIRUVSIZ buyruq bo'lib tushardi. Natija: haqiqatan band bo'lsa `true`.
   */
  async confirmBusy(id: number): Promise<boolean> {
    const term = this.terms.get(id);
    if (!term?.busy) return false;
    if (process.platform !== "win32" || term.kind === "wsl") return true;
    const running = await hasProgramChild(term.proc.pid).catch(() => true);
    if (!running) this.setBusy(id, term, false);
    return running;
  }

  cwd(id: number): string | null {
    return this.terms.get(id)?.cwd ?? null;
  }

  /** Terminal qaysi shell'da (ruxsat tekshiruvi shu sintaksis bilan). */
  kind(id: number): ShellKind | null {
    return this.terms.get(id)?.kind ?? null;
  }

  /** Ruxsat etilgan buyruqni yuboradi: busy deb belgilanadi (prompt qaytguncha). */
  forward(id: number, line: string): void {
    const term = this.terms.get(id);
    if (!term) return;
    this.setBusy(id, term, true);
    term.proc.write(`${line}\r`);
  }

  /** Jarayon savoliga javob (raw) yoki prompt'dagi erkin kiritma. */
  raw(id: number, data: string): void {
    this.terms.get(id)?.proc.write(data);
  }

  /** Bloklangan buyruqni terminal oynasida ko'rsatadi (pty'ga yubormaydi). */
  echo(id: number, text: string): void {
    this.events.data(id, text);
  }

  interrupt(id: number): void {
    this.terms.get(id)?.proc.write("\x03");
  }

  /** Yangi prompt belgisi kelsa — jarayon tugagan, keyingi kiritma yana buyruq sifatida tekshiriladi. */
  private observe(id: number, term: Term, data: string): void {
    const chunk = term.carry + data;
    term.carry = data.slice(-(PROMPT_MARK.length - 1));
    if (term.busy && chunk.includes(PROMPT_MARK)) this.setBusy(id, term, false);
  }

  private setBusy(id: number, term: Term, busy: boolean): void {
    if (term.busy === busy) return;
    term.busy = busy;
    this.events.busy(id, busy);
  }

  resize(id: number, cols: number, rows: number): void {
    try {
      this.terms.get(id)?.proc.resize(clamp(cols, 20, 500), clamp(rows, 5, 200));
    } catch {
      // jarayon allaqachon tugagan
    }
  }

  kill(id: number): void {
    const term = this.terms.get(id);
    if (!term) return;
    this.terms.delete(id);
    try {
      term.proc.kill();
    } catch {
      // allaqachon tugagan
    }
  }

  killAll(): void {
    processLister.stop();
    for (const id of [...this.terms.keys()]) this.kill(id);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
}

/** Shell'ning o'zi (yoki uning yordamchilari) — "dastur ishlayapti" hisoblanmaydi. */
const SHELL_PROCESSES = new Set(["bash.exe", "sh.exe", "conhost.exe", "openconsole.exe", "cmd.exe", "powershell.exe", "pwsh.exe"]);

/**
 * Jarayonlar ro'yxati uchun doimiy PowerShell yordamchisi: har so'rovda PowerShell'ni qayta ishga tushirish
 * sekin kompyuterlarda 5–10 s oladi, doimiy jarayon esa ~0.5 s da javob beradi. Birinchi terminal ochilganda isitiladi.
 */
class ProcessLister {
  private ps: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private waiters: { resolve(out: string): void; reject(err: Error): void }[] = [];

  warm(): void {
    if (this.ps || process.platform !== "win32") return;
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "-"], { windowsHide: true });
    ps.stdout.setEncoding("utf8");
    ps.stdout.on("data", (d: string) => {
      this.buf += d;
      let i: number;
      while ((i = this.buf.indexOf(END)) >= 0) {
        const out = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + END.length);
        this.waiters.shift()?.resolve(out);
      }
    });
    ps.on("exit", () => {
      this.ps = null;
      for (const w of this.waiters.splice(0)) w.reject(new Error("exit"));
    });
    this.ps = ps;
  }

  list(): Promise<string> {
    this.warm();
    const ps = this.ps;
    if (!ps) return Promise.reject(new Error("no powershell"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 15_000);
      this.waiters.push({
        resolve: (o) => {
          clearTimeout(timer);
          resolve(o);
        },
        reject,
      });
      ps.stdin.write(
        `Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.Name)" }; Write-Output '${END}'\n`,
      );
    });
  }

  stop(): void {
    this.ps?.kill();
    this.ps = null;
  }
}

const END = "__KODIM_END__";
export const processLister = new ProcessLister();

/** `pid` ning avlodlari ichida shell bo'lmagan jarayon (node, npm, python …) bormi. */
async function hasProgramChild(pid: number): Promise<boolean> {
  const stdout = await processLister.list();
  const children = new Map<number, { pid: number; name: string }[]>();
  for (const line of stdout.split(/\r?\n/)) {
    const [p, pp, ...name] = line.split(",");
    const child = { pid: Number(p), name: name.join(",").trim().toLowerCase() };
    const parent = Number(pp);
    if (!Number.isFinite(child.pid) || !Number.isFinite(parent)) continue;
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  const stack = [...(children.get(pid) ?? [])];
  const seen = new Set<number>();
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c.pid)) continue;
    seen.add(c.pid);
    if (!SHELL_PROCESSES.has(c.name)) return true;
    stack.push(...(children.get(c.pid) ?? []));
  }
  return false;
}
