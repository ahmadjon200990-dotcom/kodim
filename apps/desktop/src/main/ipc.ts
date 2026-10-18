import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { IPC, type Result } from "../common/api";
import type { ExamSession } from "./session";
import { pasteInternal, writeInternal } from "./clipboard";
import { store } from "./store";
import { uz } from "./uz";
import { WorkspaceError, type Workspace } from "./workspace";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function registerIpc(session: ExamSession, getRenderer: () => WebContents | null): void {
  // Faqat asosiy oynadagi ilova sahifasidan kelgan so'rovlar qabul qilinadi.
  const handle = (channel: string, fn: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (e.sender !== getRenderer()) throw new Error("forbidden");
      return fn(...args);
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
  handle(IPC.clipboardWrite, (text) => writeInternal(str(text)));
  handle(IPC.clipboardPaste, (source) => {
    const src = source === "editor" || source === "terminal" ? source : "input";
    return pasteInternal(src, (details) => session.reportEvent("PASTE_BLOCKED", details));
  });

  handle(IPC.fsList, async (dir) => (session.workspace ? session.workspace.list(str(dir)) : []));
  handle(IPC.fsRead, async (path) => {
    if (!session.workspace) throw new Error(uz.noWorkspace);
    return session.workspace.read(str(path));
  });
  handle(IPC.fsWrite, (path, content) => wsOp((ws) => ws.write(str(path), str(content))));
  handle(IPC.fsCreateFile, (path) => wsOp((ws) => ws.createFile(str(path))));
  handle(IPC.fsCreateDir, (path) => wsOp((ws) => ws.createDir(str(path))));
  handle(IPC.fsRename, (from, to) => wsOp((ws) => ws.rename(str(from), str(to))));
  handle(IPC.fsRemove, (path) => wsOp((ws) => ws.remove(str(path))));
}
