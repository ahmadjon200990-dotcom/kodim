import * as pty from "node-pty";

// Terminal (CLAUDE.md 5.1, 5.5): node-pty + PowerShell, ish papkasida. Buyruqlar bloklanmaydi —
// kiritma Enter'gacha buferlanadi va har bir qator `onCommand` ga beriladi (kuzatuv uchun).

export interface CommandInfo {
  line: string;
  /** Tab-to'ldirish yoki tarixdan tanlash bo'lgan — qator taxminiy bo'lishi mumkin. */
  approximate: boolean;
  terminalId: number;
}

interface Term {
  proc: pty.IPty;
  buffer: string;
  approximate: boolean;
  history: string[];
  historyIndex: number;
  /** Escape-ketma-ketlik ichidamizmi (strelkalar va h.k.). */
  escape: string;
}

export interface TerminalEvents {
  data(id: number, data: string): void;
  exit(id: number, code: number): void;
  command(info: CommandInfo): void;
}

const MAX_TERMINALS = 5;

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
    // Vite va boshqalar tashqi brauzerni ochmasin.
    env.BROWSER = "none";
    env.KODIM_ROOT = cwd;
    // Prompt ish papkasining to'liq yo'lini ko'rsatmasin: "PS ~\src>".
    const prompt =
      "function global:prompt { $p = (Get-Location).Path; $r = $env:KODIM_ROOT; " +
      "if ($p.StartsWith($r)) { $p = '~' + $p.Substring($r.Length) }; \"PS $p> \" }";
    const proc = pty.spawn(
      isWin ? "powershell.exe" : (process.env.SHELL ?? "bash"),
      // npm.ps1 kabi skriptlar ishlashi uchun ExecutionPolicy faqat shu jarayon doirasida.
      isWin ? ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", prompt] : [],
      { name: "xterm-256color", cols: clamp(cols, 20, 500), rows: clamp(rows, 5, 200), cwd, env },
    );
    const id = this.nextId++;
    this.terms.set(id, { proc, buffer: "", approximate: false, history: [], historyIndex: 0, escape: "" });
    proc.onData((data) => this.events.data(id, data));
    proc.onExit(({ exitCode }) => {
      this.terms.delete(id);
      this.events.exit(id, exitCode);
    });
    return id;
  }

  write(id: number, data: string): void {
    const term = this.terms.get(id);
    if (!term) return;
    this.track(id, term, data);
    term.proc.write(data);
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

  /** Vaqt tugaganda: terminal va undan ishga tushgan dev serverlar o'chiriladi. */
  killAll(): void {
    for (const id of [...this.terms.keys()]) this.kill(id);
  }

  /** Klaviatura kiritmasini Enter'gacha buferlaydi (Backspace, Ctrl+C/U, strelkalar hisobga olinadi). */
  private track(id: number, term: Term, data: string): void {
    for (const ch of data) {
      if (term.escape) {
        term.escape += ch;
        // CSI ketma-ketligi harf bilan tugaydi: \x1b[A (yuqori), \x1b[B (past), \x1b[C/D (o'ng/chap)...
        if (/[A-Za-z~]/.test(ch) && term.escape.length > 2) {
          this.onEscape(term, term.escape);
          term.escape = "";
        } else if (term.escape.length > 8) term.escape = "";
        continue;
      }
      if (ch === "\x1b") {
        term.escape = ch;
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        const line = term.buffer.trim();
        if (line) {
          term.history.push(line);
          if (term.history.length > 200) term.history.shift();
          this.events.command({ line, approximate: term.approximate, terminalId: id });
        }
        term.buffer = "";
        term.approximate = false;
        term.historyIndex = term.history.length;
      } else if (ch === "\x7f" || ch === "\b") {
        term.buffer = term.buffer.slice(0, -1);
      } else if (ch === "\x03" || ch === "\x15") {
        term.buffer = "";
        term.approximate = false;
      } else if (ch === "\t") {
        term.approximate = true;
      } else if (ch >= " ") {
        term.buffer += ch;
        if (term.buffer.length > 4000) term.buffer = term.buffer.slice(-4000);
      }
    }
  }

  private onEscape(term: Term, seq: string): void {
    const key = seq.slice(-1);
    if (key === "A" || key === "B") {
      // Tarixdan buyruq: PowerShell tarixini taxminan kuzatamiz.
      term.historyIndex = Math.max(0, Math.min(term.history.length, term.historyIndex + (key === "A" ? -1 : 1)));
      term.buffer = term.history[term.historyIndex] ?? "";
      term.approximate = true;
    } else if (key === "C" || key === "D" || key === "H" || key === "F" || key === "~") {
      // Kursor qator o'rtasida tahrirlanishi mumkin — qator taxminiy.
      term.approximate = true;
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
}
