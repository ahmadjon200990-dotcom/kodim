import { readFile, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { isIgnoredPath, isReadonlyPath, SAFE_COMMAND_WINDOW_MS } from "@exam-ide/shared";
import type { ExamSession } from "./session";
import type { Workspace } from "./workspace";

// Tashqi fayl o'zgarishini aniqlash (CLAUDE.md 5.5, chokidar):
// editor xeshiga teng → normal; yaqinda xavfsiz buyruq bo'lsa → INFO; aks holda EXTERNAL_FILE_CHANGE.

interface WatcherDeps {
  session: ExamSession;
  workspace: Workspace;
  /** readonly fayl buzilsa — asl tarkibni qaytaradi (server bergan). */
  readonlyContent(rel: string): { content: string; encoding?: "base64" } | null;
  /** Ochiq faylni renderer'da qayta yuklash uchun. */
  onDiskChange(rel: string): void;
}

export class Watcher {
  private watcher: FSWatcher | null = null;
  private lastSafeCommandAt = 0;
  private deps: WatcherDeps | null = null;
  /** Qisqa vaqtda bir xil fayl uchun takroriy xabarlarni kamaytirish. */
  private readonly recentReports = new Map<string, number>();

  start(deps: WatcherDeps): void {
    if (this.watcher) return;
    this.deps = deps;
    this.watcher = chokidar.watch(deps.workspace.root, {
      ignoreInitial: true,
      // node_modules, .git, dist, build, .vite va lock fayllar e'tiborga olinmaydi.
      ignored: (path: string) => {
        const rel = relative(deps.workspace.root, path).split(sep).join("/");
        return rel !== "" && isIgnoredPath(rel);
      },
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });
    const handle = (abs: string, removed: boolean) => void this.onChange(abs, removed);
    this.watcher.on("add", (p) => handle(p, false));
    this.watcher.on("change", (p) => handle(p, false));
    this.watcher.on("unlink", (p) => handle(p, true));
  }

  noteSafeCommand(): void {
    this.lastSafeCommandAt = Date.now();
  }

  private rel(abs: string): string {
    return relative(this.deps!.workspace.root, abs).split(sep).join("/");
  }

  private async onChange(abs: string, removed: boolean): Promise<void> {
    const deps = this.deps;
    if (!deps || deps.session.state.locked) return;
    const rel = this.rel(abs);
    if (!rel || isIgnoredPath(rel)) return;

    // Read-only fayl (savollar.md / dizaynlar) o'zgartirildi yoki o'chirildi — tiklaymiz.
    if (isReadonlyPath(rel)) {
      const original = deps.readonlyContent(rel);
      let tampered = removed;
      if (!removed && original) {
        if (original.encoding === "base64") {
          const buf = await readFile(abs).catch(() => null);
          tampered = buf !== null && buf.toString("base64") !== original.content;
        } else {
          const content = await readFile(abs, "utf8").catch(() => null);
          tampered = content !== null && content !== original.content;
        }
      }
      if (tampered && original) {
        await deps.workspace.restoreReadonly(rel, original.content, original.encoding);
        deps.onDiskChange(rel);
        this.report("READONLY_TAMPER", { path: rel, removed });
      }
      return;
    }

    if (removed) {
      deps.workspace.forgetHash(rel);
      return;
    }

    const info = await stat(abs).catch(() => null);
    if (!info?.isFile()) return;
    const content = await readFile(abs, "utf8").catch(() => null);
    if (content === null) return;

    // Editor saqlagani — normal. Renderer'ga XABAR BERILMAYDI: aks holda u diskdagi (eskiroq) matnni
    // modelga qayta yuklab, kursorni boshiga otib, oxirgi yozilganlarni yo'qotardi (kursor sakrash xatosi).
    if (deps.workspace.isEditorChange(rel, content)) return;

    // Yaqinda xavfsiz buyruq (npm install ...) ishlagan — unga bog'laymiz, faqat INFO.
    if (Date.now() - this.lastSafeCommandAt < SAFE_COMMAND_WINDOW_MS) {
      deps.onDiskChange(rel);
      return;
    }

    deps.onDiskChange(rel);
    this.report("EXTERNAL_FILE_CHANGE", {
      path: rel,
      size: info.size,
      preview: content.slice(0, 300),
    });
  }

  private report(type: "READONLY_TAMPER" | "EXTERNAL_FILE_CHANGE", details: Record<string, unknown>): void {
    const key = `${type}:${String(details.path)}`;
    const now = Date.now();
    if (now - (this.recentReports.get(key) ?? 0) < 3000) return;
    this.recentReports.set(key, now);
    this.deps?.session.reportEvent(type, details);
  }

  async stop(): Promise<void> {
    const w = this.watcher;
    this.watcher = null;
    this.deps = null;
    this.recentReports.clear();
    await w?.close();
  }
}
