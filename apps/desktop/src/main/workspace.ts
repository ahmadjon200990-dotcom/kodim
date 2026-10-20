import { createHash } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { app } from "electron";
import { IGNORED_DIRS, isIgnoredPath, isReadonlyPath, SYNC_LIMITS } from "@exam-ide/shared";
import type { FileEntry } from "@exam-ide/shared";
import type { FsEntry } from "../common/api";
import { uz } from "./uz";

export class WorkspaceError extends Error {}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

const IMAGE_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
};

function imageMime(path: string): string | null {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return IMAGE_EXT[ext] ?? null;
}

export const isImagePath = (path: string): boolean => imageMime(path) !== null;

/** Ish papkasiga nisbatan yo'l: `/` bilan, `..` siz, Windows uchun yaroqli nomlar. */
function checkRelPath(rel: string): string {
  const parts = rel.split("/");
  const hasControlChar = (p: string) => [...p].some((ch) => ch.charCodeAt(0) < 32);
  const valid = parts.every(
    (p) =>
      p.length > 0 &&
      p !== "." &&
      p !== ".." &&
      !/[<>:"\\|?*]/.test(p) &&
      !hasControlChar(p) &&
      !/[. ]$/.test(p) &&
      !WINDOWS_RESERVED.test(p),
  );
  if (!valid || rel.length > 260) throw new WorkspaceError(uz.invalidName);
  return rel;
}

export const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

export class Workspace {
  readonly root: string;
  /** Editor/ilova yozgan fayllar xeshi — watcher tashqi o'zgarishni ajratishi uchun. */
  private readonly editorHashes = new Map<string, string>();

  constructor(attemptId: string) {
    // Foydalanuvchiga yo'l ko'rsatilmaydi.
    this.root = join(app.getPath("userData"), "workspaces", attemptId);
  }

  private mark(rel: string, content: string): void {
    this.editorHashes.set(rel, sha1(content));
  }

  /** Watcher ko'rgan o'zgarish editor saqlashiga tengmi (normal) yoki tashqimi. */
  isEditorChange(rel: string, content: string): boolean {
    return this.editorHashes.get(rel) === sha1(content);
  }

  forgetHash(rel: string): void {
    this.editorHashes.delete(rel);
  }

  private abs(rel: string): string {
    const abs = resolve(this.root, ...checkRelPath(rel).split("/"));
    if (!abs.startsWith(this.root + sep)) throw new WorkspaceError(uz.invalidName);
    return abs;
  }

  private toRel(abs: string): string {
    return relative(this.root, abs).split(sep).join("/");
  }

  private async exists(abs: string): Promise<boolean> {
    return stat(abs).then(
      () => true,
      () => false,
    );
  }

  private guardWritable(rel: string): void {
    if (isReadonlyPath(rel)) throw new WorkspaceError(uz.readonly);
  }

  async isEmpty(): Promise<boolean> {
    const entries = await readdir(this.root).catch(() => []);
    return entries.length === 0;
  }

  /**
   * Server bergan fayllarni yozadi. Papka bo'sh bo'lsa — hammasi (yangi imtihon yoki boshqa kompyuter);
   * aks holda mahalliy fayllar yangiroq deb qoldiriladi, faqat faqat-o'qish fayllari yangilanadi.
   */
  async init(files: FileEntry[]): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const fresh = await this.isEmpty();
    for (const f of files) {
      const readonly = isReadonlyPath(f.path);
      if (!fresh && !readonly) continue;
      const abs = this.abs(f.path);
      await mkdir(dirname(abs), { recursive: true });
      // Faqat-o'qish fayllari: yozishdan oldin atributni olib, keyin qaytaramiz (Windows'da read-only atribut).
      if (readonly) await chmod(abs, 0o666).catch(() => undefined);
      // Binar (dizayn rasmi) base64 dan yoziladi; matn utf8.
      if (f.encoding === "base64") {
        await writeFile(abs, Buffer.from(f.content, "base64"));
      } else {
        this.mark(f.path, f.content);
        await writeFile(abs, f.content, "utf8");
      }
      if (readonly) await chmod(abs, 0o444);
    }
  }

  async list(dir: string): Promise<FsEntry[]> {
    const absDir = dir ? this.abs(dir) : this.root;
    const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((e) => e.isFile() || e.isDirectory())
      .map((e): FsEntry => {
        const path = this.toRel(join(absDir, e.name));
        return {
          name: e.name,
          path,
          type: e.isDirectory() ? "dir" : "file",
          readonly: isReadonlyPath(path),
          ...(e.isFile() && isImagePath(path) ? { image: true } : {}),
        };
      })
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  }

  async read(rel: string): Promise<string> {
    return readFile(this.abs(rel), "utf8");
  }

  /** Rasm faylini data: URL sifatida qaytaradi (editorda ko'rsatish uchun). */
  async readImage(rel: string): Promise<string> {
    const mime = imageMime(rel);
    if (!mime) throw new WorkspaceError(uz.notFound);
    const buf = await readFile(this.abs(rel));
    if (buf.length > 8 * 1024 * 1024) throw new WorkspaceError(uz.failed);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  /** Ilova ichida ko'chirish: `from` ni `toDir` papkasiga (fayl nomi saqlanadi). */
  async move(from: string, toDir: string): Promise<void> {
    this.guardWritable(from);
    const name = from.split("/").pop() ?? from;
    const target = toDir ? `${toDir}/${name}` : name;
    if (target === from) return;
    if (target.startsWith(`${from}/`)) throw new WorkspaceError(uz.invalidName);
    await this.rename(from, target);
  }

  async write(rel: string, content: string): Promise<void> {
    this.guardWritable(rel);
    const abs = this.abs(rel);
    await mkdir(dirname(abs), { recursive: true });
    this.mark(rel, content);
    await writeFile(abs, content, "utf8");
  }

  async createFile(rel: string): Promise<void> {
    this.guardWritable(rel);
    const abs = this.abs(rel);
    if (await this.exists(abs)) throw new WorkspaceError(uz.exists);
    await mkdir(dirname(abs), { recursive: true });
    this.mark(rel, "");
    await writeFile(abs, "", "utf8");
  }

  async createDir(rel: string): Promise<void> {
    this.guardWritable(rel);
    const abs = this.abs(rel);
    if (await this.exists(abs)) throw new WorkspaceError(uz.exists);
    await mkdir(abs, { recursive: true });
  }

  async rename(from: string, to: string): Promise<void> {
    this.guardWritable(from);
    this.guardWritable(to);
    const src = this.abs(from);
    const dst = this.abs(to);
    if (!(await this.exists(src))) throw new WorkspaceError(uz.notFound);
    // Windows'da katta-kichik harf farqi bilan qayta nomlashga ruxsat.
    if (from.toLowerCase() !== to.toLowerCase() && (await this.exists(dst))) throw new WorkspaceError(uz.exists);
    await mkdir(dirname(dst), { recursive: true });
    await rename(src, dst);
  }

  async remove(rel: string): Promise<void> {
    this.guardWritable(rel);
    await rm(this.abs(rel), { recursive: true, force: true });
  }

  /** Imtihon tugagach butun ish papkasini o'chiradi (read-only atributlarni ham). */
  async destroy(): Promise<void> {
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) await walk(abs);
        else await chmod(abs, 0o666).catch(() => undefined);
      }
    };
    await walk(this.root);
    await rm(this.root, { recursive: true, force: true }).catch(() => undefined);
  }

  /** Buzilgan yoki o'chirilgan read-only faylni asl tarkib bilan tiklaydi (READONLY_TAMPER). */
  async restoreReadonly(rel: string, content: string, encoding?: "base64"): Promise<void> {
    if (!isReadonlyPath(rel)) return;
    const abs = this.abs(rel);
    await mkdir(dirname(abs), { recursive: true });
    await chmod(abs, 0o666).catch(() => undefined);
    if (encoding === "base64") await writeFile(abs, Buffer.from(content, "base64"));
    else await writeFile(abs, content, "utf8");
    await chmod(abs, 0o444);
  }

  /** Sync uchun: e'tiborga olinmaydiganlar va faqat-o'qish fayllarisiz matn fayllari (≤ 1 MB, ≤ 300 ta). */
  async snapshot(): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    const walk = async (absDir: string): Promise<void> => {
      const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (files.size >= SYNC_LIMITS.maxFiles) return;
        const abs = join(absDir, e.name);
        const rel = this.toRel(abs);
        if (e.isDirectory()) {
          if (!(IGNORED_DIRS as readonly string[]).includes(e.name)) await walk(abs);
          continue;
        }
        if (!e.isFile() || isIgnoredPath(rel) || isReadonlyPath(rel)) continue;
        const info = await stat(abs).catch(() => null);
        if (!info || info.size > SYNC_LIMITS.maxFileBytes) continue;
        const buf = await readFile(abs).catch(() => null);
        if (!buf || buf.subarray(0, 8000).includes(0)) continue; // binar fayl
        files.set(rel, buf.toString("utf8"));
      }
    };
    await walk(this.root);
    return files;
  }
}
