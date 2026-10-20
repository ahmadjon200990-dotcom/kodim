import * as pty from "node-pty";

// Terminal (CLAUDE.md 3): node-pty + PowerShell, ish papkasida.
// Kiritish qatorini ilova boshqaradi — buyruq pty'ga YUBORILISHIDAN OLDIN ruxsat tekshiriladi (ipc.ts).
// Jarayon ishlayotganda (busy) kiritma to'g'ridan-to'g'ri o'tadi (interaktiv savollar uchun).

export interface CommandInfo {
  line: string;
  terminalId: number;
}

interface Term {
  proc: pty.IPty;
  cwd: string;
  busy: boolean;
  /** Oxirgi chiqish (ANSI tozalangan) — shell prompt'iga qaytganini aniqlash uchun. */
  tail: string;
}

export interface TerminalEvents {
  data(id: number, data: string): void;
  exit(id: number, code: number): void;
  busy(id: number, busy: boolean): void;
}

const MAX_TERMINALS = 5;
// eslint-disable-next-line no-control-regex -- ANSI escape ketma-ketliklarini olib tashlash
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]/g;
/** Bizning prompt: "PS ~\src> " — shu bilan tugasa, buyruq tugagan (idle). */
const PROMPT_END = /PS [^\n]*>\s?$/;

export class Terminals {
  private readonly terms = new Map<number, Term>();
  private nextId = 1;

  constructor(private readonly events: TerminalEvents) {}

  create(cwd: string, cols: number, rows: number): number | null {
    if (this.terms.size >= MAX_TERMINALS) return null;
    const isWin = process.platform === "win32";
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !k.startsWith("ELECTRON_")) env[k] = v;
    }
    env.BROWSER = "none";
    env.KODIM_ROOT = cwd;
    const prompt =
      "function global:prompt { $p = (Get-Location).Path; $r = $env:KODIM_ROOT; " +
      "if ($p.StartsWith($r)) { $p = '~' + $p.Substring($r.Length) }; \"PS $p> \" }";
    const proc = pty.spawn(
      isWin ? "powershell.exe" : (process.env.SHELL ?? "bash"),
      isWin ? ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", prompt] : [],
      { name: "xterm-256color", cols: clamp(cols, 20, 500), rows: clamp(rows, 5, 200), cwd, env },
    );
    const id = this.nextId++;
    const term: Term = { proc, cwd, busy: false, tail: "" };
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

  cwd(id: number): string | null {
    return this.terms.get(id)?.cwd ?? null;
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

  private observe(id: number, term: Term, data: string): void {
    term.tail = (term.tail + data.replace(ANSI, "")).slice(-200);
    const idle = PROMPT_END.test(term.tail);
    if (idle && term.busy) this.setBusy(id, term, false);
    // cwd o'zgarishini taxminan kuzatish shart emas — Tab to'ldirish faqat ildizdan.
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
    for (const id of [...this.terms.keys()]) this.kill(id);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
}
