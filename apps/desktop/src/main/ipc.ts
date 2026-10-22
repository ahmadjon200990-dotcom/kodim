import { ipcMain, net, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";
import { checkCommand, isShellAllowed, SHELL_KINDS, SHELL_LABELS, type ShellKind } from "@exam-ide/shared";
import { EventType } from "@exam-ide/shared";
import { IPC, type Rect, type Result, type TerminalProfiles, type TerminalSubmit } from "../common/api";
import { detectShells } from "./shells";
import type { ExamBrowser } from "./browser";
import { pasteInternal, writeInternal } from "./clipboard";
import type { LiveServer } from "./liveServer";
import type { Monitor } from "./monitor";
import type { ExamSession } from "./session";
import { store } from "./store";
import type { Terminals } from "./terminal";
import { uz } from "./uz";
import { WorkspaceError, type Workspace } from "./workspace";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function rect(v: unknown): Rect | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return { x: num(r.x), y: num(r.y), width: num(r.width), height: num(r.height) };
}

export interface IpcContext {
  session: ExamSession;
  terminals: Terminals;
  browser: ExamBrowser;
  live: LiveServer;
  monitor: Monitor;
  getRenderer(): WebContents | null;
}

/** Renderer yuborishi mumkin bo'lgan event turlari (screenshot, DevTools, tashqariga nusxalash). */
const RENDERER_EVENTS = new Set<string>(["SCREENSHOT_ATTEMPT", "DEVTOOLS_ATTEMPT", "COPY_OUT_ATTEMPT", "DROP_BLOCKED"]);

export function registerIpc({ session, terminals, browser, live, monitor, getRenderer }: IpcContext): void {
  // Faqat asosiy oynadagi ilova sahifasidan kelgan so'rovlar qabul qilinadi.
  const handle = (channel: string, fn: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (e.sender !== getRenderer()) throw new Error("forbidden");
      return fn(...args);
    });
  };
  const on = (channel: string, fn: (...args: unknown[]) => void) => {
    ipcMain.on(channel, (e: IpcMainEvent, ...args: unknown[]) => {
      if (e.sender === getRenderer()) fn(...args);
    });
  };

  const wsOp = async (fn: (ws: Workspace) => Promise<void>): Promise<Result> => {
    const ws = session.workspace;
    if (!ws) return { ok: false, error: uz.noWorkspace };
    if (session.state.locked) return { ok: false, error: uz.locked };
    try {
      await fn(ws);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof WorkspaceError ? err.message : uz.failed };
    }
  };

  handle(IPC.getState, () => session.state);
  handle(IPC.lastName, () => store.lastName());
  handle(IPC.join, (code, name) => session.join(str(code).trim(), str(name).trim()));
  handle(IPC.submit, () => session.submit());
  handle(IPC.serverGet, () => ({ url: session.serverUrl, defaultUrl: __SERVER_URL__ }));
  handle(IPC.serverSet, async (urlArg): Promise<Result> => {
    if (urlArg === null) return session.setServerUrl(null);
    let url: URL;
    try {
      url = new URL(str(urlArg).trim());
    } catch {
      return { ok: false, error: uz.serverInvalid };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: uz.serverInvalid };
    const base = url.origin;
    // Haqiqatan Kodim serveri ekanini tekshiramiz (noto'g'ri manzil bilan qolib ketmaslik uchun).
    try {
      const res = await net.fetch(`${base}/api/health`, { signal: AbortSignal.timeout(6000) });
      const body = (await res.json()) as { ok?: boolean };
      if (!body.ok) return { ok: false, error: uz.serverUnreachable };
    } catch {
      return { ok: false, error: uz.serverUnreachable };
    }
    return session.setServerUrl(base === new URL(__SERVER_URL__).origin ? null : base);
  });
  handle(IPC.clipboardWrite, (text) => writeInternal(str(text)));
  handle(IPC.clipboardPaste, (source) => {
    const src = source === "editor" || source === "terminal" ? source : "input";
    return pasteInternal(src, (details) => session.reportEvent("PASTE_BLOCKED", details));
  });

  // ---- Terminal (CLAUDE.md 3, 0.8.2): profillar; buyruq pty'ga YUBORILISHIDAN OLDIN shell sintaksisi bilan tekshiriladi.
  const usableShells = async (): Promise<ShellKind[]> =>
    (await detectShells()).filter((k) => isShellAllowed(k, session.allowedShells()));

  handle(IPC.termProfiles, async (): Promise<TerminalProfiles> => {
    const kinds = await usableShells();
    const saved = store.terminalProfile();
    return {
      profiles: kinds.map((kind) => ({ kind, label: SHELL_LABELS[kind] })),
      defaultKind: saved && kinds.includes(saved) ? saved : (kinds[0] ?? null),
    };
  });
  on(IPC.termSetDefault, (kind) => {
    if ((SHELL_KINDS as readonly unknown[]).includes(kind)) store.setTerminalProfile(kind as ShellKind);
  });

  handle(IPC.termCreate, async (kindArg, cols, rows) => {
    const ws = session.workspace;
    if (!ws) return { ok: false, error: uz.noWorkspace };
    if (session.state.locked) return { ok: false, error: uz.locked };
    const usable = await usableShells();
    const saved = store.terminalProfile();
    const kind: ShellKind | undefined =
      kindArg === null || kindArg === undefined ? (saved && usable.includes(saved) ? saved : usable[0]) : (kindArg as ShellKind);
    if (!kind || !usable.includes(kind)) return { ok: false, error: uz.shellNotAllowed };
    try {
      const id = terminals.create(kind, ws.root, num(cols), num(rows));
      if (id === undefined) return { ok: false, error: uz.shellMissing };
      return id === null ? { ok: false, error: uz.tooManyTerminals } : { ok: true, id, kind };
    } catch {
      return { ok: false, error: uz.terminalFailed };
    }
  });

  handle(IPC.termSubmit, (idArg, lineArg): TerminalSubmit => {
    const id = num(idArg);
    const line = str(lineArg);
    if (session.state.locked) return { ok: false, error: uz.locked };
    // Jarayon ishlayotganda (busy) kiritma interaktiv javob sifatida to'g'ridan-to'g'ri o'tadi.
    if (terminals.isBusy(id)) {
      terminals.raw(id, `${line}\r`);
      return { ok: true, forwarded: true };
    }
    if (!line.trim()) {
      terminals.raw(id, "\r");
      return { ok: true, forwarded: true };
    }
    const shell = terminals.kind(id) ?? "powershell";
    const verdict = checkCommand(line, session.allowedCommands(), shell);
    if (!verdict.ok) {
      terminals.echo(id, `\r\n\x1b[31m${line}\x1b[0m\r\n\x1b[33m${verdict.message}\x1b[0m\r\n`);
      session.reportEvent("BLOCKED_COMMAND", { line, reason: verdict.reason, shell });
      return { ok: true, forwarded: false, blocked: verdict.message };
    }
    // Ruxsat etilmagan paket o'rnatish ham bloklanadi.
    const unknown = monitor.unknownPackages(line);
    if (unknown.length) {
      terminals.echo(id, `\r\n\x1b[31m${line}\x1b[0m\r\n\x1b[33m${uz.packageBlocked(unknown)}\x1b[0m\r\n`);
      session.reportEvent("UNKNOWN_PACKAGE", { packages: unknown, line, blocked: true });
      session.reportEvent("BLOCKED_COMMAND", { line, reason: "UNKNOWN_PACKAGE", shell });
      return { ok: true, forwarded: false, blocked: uz.packageBlocked(unknown) };
    }
    monitor.onAllowedCommand({ line, terminalId: id });
    terminals.forward(id, line);
    return { ok: true, forwarded: true };
  });

  on(IPC.termInterrupt, (id) => terminals.interrupt(num(id)));
  handle(IPC.termComplete, async (idArg, prefixArg) => {
    const ws = session.workspace;
    if (!ws) return [];
    const prefix = str(prefixArg);
    const slash = prefix.lastIndexOf("/");
    const dir = slash >= 0 ? prefix.slice(0, slash) : "";
    const part = (slash >= 0 ? prefix.slice(slash + 1) : prefix).toLowerCase();
    const entries = await ws.list(dir).catch(() => []);
    return entries
      .filter((e) => e.name.toLowerCase().startsWith(part))
      .map((e) => (dir ? `${dir}/${e.name}` : e.name) + (e.type === "dir" ? "/" : ""));
  });
  on(IPC.termResize, (id, cols, rows) => terminals.resize(num(id), num(cols), num(rows)));
  on(IPC.termKill, (id) => terminals.kill(num(id)));
  on(IPC.reportLargeInsert, (chars) => session.reportEvent("LARGE_INSERT", { chars: num(chars) }));
  on(IPC.reportEvent, (type, details) => {
    const t = str(type);
    if (!RENDERER_EVENTS.has(t)) return;
    const parsed = EventType.safeParse(t);
    if (parsed.success) session.reportEvent(parsed.data, (details ?? {}) as Record<string, unknown>);
  });

  // ---- Ichki brauzer va Go Live
  on(IPC.browserBounds, (r) => browser.setBounds(rect(r)));
  handle(IPC.browserNavigate, (url): Result =>
    browser.navigate(str(url)) ? { ok: true } : { ok: false, error: uz.urlNotAllowed },
  );
  on(IPC.browserBack, () => browser.back());
  on(IPC.browserForward, () => browser.forward());
  on(IPC.browserReload, () => browser.reload());
  handle(IPC.browserGoLive, async () => {
    const ws = session.workspace;
    if (!ws || session.state.locked) return { ok: false, error: uz.noWorkspace };
    try {
      const url = await live.start(ws.root);
      browser.navigate(url);
      return { ok: true, url };
    } catch {
      return { ok: false, error: uz.failed };
    }
  });

  // ---- Fayllar
  handle(IPC.fsList, async (dir) => (session.workspace ? session.workspace.list(str(dir)) : []));
  handle(IPC.fsRead, async (path) => {
    if (!session.workspace) throw new Error(uz.noWorkspace);
    return session.workspace.read(str(path));
  });
  handle(IPC.fsReadImage, async (path) => {
    if (!session.workspace) throw new Error(uz.noWorkspace);
    return session.workspace.readImage(str(path));
  });
  handle(IPC.fsWrite, (path, content) => wsOp((ws) => ws.write(str(path), str(content))));
  handle(IPC.fsCreateFile, (path) => wsOp((ws) => ws.createFile(str(path))));
  handle(IPC.fsCreateDir, (path) => wsOp((ws) => ws.createDir(str(path))));
  handle(IPC.fsRename, (from, to) => wsOp((ws) => ws.rename(str(from), str(to))));
  handle(IPC.fsMove, (from, toDir) => wsOp((ws) => ws.move(str(from), str(toDir))));
  handle(IPC.fsCopy, async (from, toDir) => {
    let path = "";
    const res = await wsOp(async (ws) => {
      path = await ws.copy(str(from), str(toDir));
    });
    return res.ok ? { ok: true, path } : res;
  });
  handle(IPC.fsRemove, (path) => wsOp((ws) => ws.remove(str(path))));
}
