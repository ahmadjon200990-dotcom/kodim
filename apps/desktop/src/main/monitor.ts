import { exec } from "node:child_process";
import {
  FOCUS_LOST_MIN_MS,
  FORBIDDEN_PROCESSES,
  isSafeFileCommand,
  matchDangerousCommand,
  parseInstalledPackages,
  PROCESS_SCAN_INTERVAL_MS,
} from "@exam-ide/shared";
import { BrowserWindow, screen } from "electron";
import type { CommandInfo } from "./terminal";
import type { ExamSession } from "./session";

// Jarayon va oyna darajasidagi kuzatuv (CLAUDE.md 5.5). Fayl kuzatuvi — watcher.ts.

interface MonitorDeps {
  session: ExamSession;
  getWindow(): BrowserWindow | null;
  /** Oxirgi xavfsiz terminal buyrug'i vaqti (watcher tashqi o'zgarishni shunga bog'laydi). */
  onSafeCommand(): void;
  allowedPackages(): Set<string>;
}

export class Monitor {
  private deps: MonitorDeps | null = null;
  private timers: NodeJS.Timeout[] = [];
  private listeners: (() => void)[] = [];
  private reportedProcesses = new Set<string>();
  private reportedDisplays = false;
  private focusLostAt = 0;
  private focusHandle: { update(d: Record<string, unknown>): void } | null = null;

  /** Imtihon boshlanganda (yoki qayta kirishda ishga tushganda). */
  start(deps: MonitorDeps): void {
    if (this.deps) return;
    this.deps = deps;
    const win = deps.getWindow();

    if (win) {
      const onBlur = () => this.onFocusLost();
      const onFocus = () => this.onFocusGained();
      const onMinimize = () => this.onFocusLost();
      win.on("blur", onBlur);
      win.on("focus", onFocus);
      win.on("minimize", onMinimize);
      win.on("restore", onFocus);
      this.listeners.push(() => {
        win.off("blur", onBlur);
        win.off("focus", onFocus);
        win.off("minimize", onMinimize);
        win.off("restore", onFocus);
      });
    }

    const onDisplay = () => this.checkDisplays();
    screen.on("display-added", onDisplay);
    this.listeners.push(() => screen.off("display-added", onDisplay));

    // Boshlanishda bir marta: ochiq taqiqlangan dasturlar va qo'shimcha monitor.
    this.checkDisplays();
    void this.scanProcesses();
    this.timers.push(setInterval(() => void this.scanProcesses(), PROCESS_SCAN_INTERVAL_MS));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    for (const off of this.listeners) off();
    this.timers = [];
    this.listeners = [];
    this.focusHandle = null;
    this.deps = null;
  }

  private onFocusLost(): void {
    if (!this.deps || this.focusLostAt) return;
    this.focusLostAt = Date.now();
    // Qisqa chalkashliklar (bildirishnoma) xabar qilinmasin — kechiktirib yuboramiz.
    setTimeout(() => {
      if (!this.deps || !this.focusLostAt || this.focusHandle) return;
      const win = this.deps.getWindow();
      if (win?.isFocused()) return;
      this.focusHandle = this.deps.session.reportEvent("FOCUS_LOST", {});
    }, FOCUS_LOST_MIN_MS);
  }

  private onFocusGained(): void {
    if (!this.focusLostAt) return;
    const durationSec = Math.round((Date.now() - this.focusLostAt) / 1000);
    this.focusLostAt = 0;
    this.focusHandle?.update({ durationSec });
    this.focusHandle = null;
  }

  private checkDisplays(): void {
    if (!this.deps || this.reportedDisplays) return;
    const count = screen.getAllDisplays().length;
    if (count > 1) {
      this.reportedDisplays = true;
      this.deps.session.reportEvent("EXTRA_DISPLAY", { count });
    }
  }

  private scanProcesses(): Promise<void> {
    if (process.platform !== "win32" || !this.deps) return Promise.resolve();
    return new Promise((resolve) => {
      exec("tasklist /fo csv /nh", { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err || !this.deps) return resolve();
        const running = new Set<string>();
        for (const line of stdout.split(/\r?\n/)) {
          const name = /^"([^"]+)"/.exec(line)?.[1]?.toLowerCase();
          if (name) running.add(name);
        }
        for (const proc of FORBIDDEN_PROCESSES) {
          if (running.has(proc) && !this.reportedProcesses.has(proc)) {
            this.reportedProcesses.add(proc);
            this.deps.session.reportEvent("FORBIDDEN_PROCESS", { process: proc });
          }
        }
        resolve();
      });
    });
  }

  /** Terminaldan kelgan har bir buyruq qatori. */
  onCommand(info: CommandInfo): void {
    if (!this.deps) return;
    const line = info.line;
    this.deps.session.reportEvent("TERMINAL_COMMAND", { line, terminalId: info.terminalId, approximate: info.approximate });

    const danger = matchDangerousCommand(line);
    if (danger) this.deps.session.reportEvent("DANGEROUS_COMMAND", { line, pattern: danger });

    const pkgs = parseInstalledPackages(line);
    if (pkgs.length) {
      const allowed = this.deps.allowedPackages();
      const unknown = pkgs.filter((p) => !allowed.has(p));
      if (unknown.length) this.deps.session.reportEvent("UNKNOWN_PACKAGE", { packages: unknown, line });
    }

    if (isSafeFileCommand(line)) this.deps.onSafeCommand();
  }
}
