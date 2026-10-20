// O'qituvchi bergan tayyor papka (.zip yoki papka tanlash) → boshlang'ich fayllar ro'yxati.
// Matn fayllari utf8, qolganlari (rasm, ikonka, shrift) base64. node_modules va .git tashlab yuboriladi.
import JSZip from "jszip";

export interface StarterFile {
  path: string;
  content: string;
  encoding?: "base64";
  size: number;
}

export const STARTER_MAX_BYTES = 20 * 1024 * 1024;
export const STARTER_MAX_FILES = 300;
/** Bitta fayl — server cheklovi (base64 hisobga olingan). */
export const STARTER_MAX_FILE_BYTES = 6 * 1024 * 1024;

const SKIP_DIRS = new Set(["node_modules", ".git", ".vite", "dist", "build", "__MACOSX", ".idea", ".vscode"]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const RESERVED = new Set(["savollar.md"]);

export class StarterError extends Error {}

function cleanPath(raw: string): string | null {
  const parts = raw.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === ".." || SKIP_DIRS.has(p))) return null;
  const name = parts[parts.length - 1];
  if (!name || SKIP_FILES.has(name)) return null;
  if (parts[0] === "dizaynlar") return null; // o'quvchi uchun faqat-o'qish papkasi — o'qituvchi rasmlari topshiriqda beriladi
  const path = parts.join("/");
  if (RESERVED.has(path)) return null;
  return path;
}

/** Hamma fayllar bitta umumiy papka ichida bo'lsa (masalan "loyiha/..."), o'sha papka olib tashlanadi. */
function stripCommonRoot(files: StarterFile[]): StarterFile[] {
  if (files.length === 0) return files;
  const first = files[0]!.path.split("/")[0];
  if (!first || !files.every((f) => f.path.startsWith(`${first}/`))) return files;
  return files.map((f) => ({ ...f, path: f.path.slice(first.length + 1) }));
}

function isText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|ico|bmp)$/i;

function toEntry(path: string, bytes: Uint8Array): StarterFile {
  if (bytes.length > STARTER_MAX_FILE_BYTES) throw new StarterError(`"${path}" juda katta (bitta fayl 6 MB dan oshmasin)`);
  if (!IMAGE_EXT.test(path) && isText(bytes)) return { path, content: new TextDecoder().decode(bytes), size: bytes.length };
  return { path, content: toBase64(bytes), encoding: "base64", size: bytes.length };
}

function check(files: StarterFile[]): StarterFile[] {
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > STARTER_MAX_BYTES) throw new StarterError(`Jami hajm ${(total / 1024 / 1024).toFixed(1)} MB — 20 MB dan oshmasligi kerak`);
  if (files.length > STARTER_MAX_FILES) throw new StarterError(`Fayllar soni ${files.length} — 300 tadan oshmasligi kerak`);
  if (files.length === 0) throw new StarterError("Papkada mos fayl topilmadi");
  return files;
}

export async function readZip(file: File): Promise<StarterFile[]> {
  if (file.size > STARTER_MAX_BYTES * 2) throw new StarterError(".zip juda katta (20 MB gacha bo'lsin)");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new StarterError("Bu .zip faylni ochib bo'lmadi");
  }
  const out: StarterFile[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = cleanPath(entry.name);
    if (!path) continue;
    out.push(toEntry(path, await entry.async("uint8array")));
    if (out.length > STARTER_MAX_FILES) break;
  }
  return check(stripCommonRoot(out));
}

/** `<input type=file webkitdirectory>` dan kelgan fayllar. */
export async function readFolder(list: FileList | File[]): Promise<StarterFile[]> {
  const out: StarterFile[] = [];
  let total = 0;
  for (const f of Array.from(list)) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const path = cleanPath(rel);
    if (!path) continue;
    total += f.size;
    if (total > STARTER_MAX_BYTES) throw new StarterError("Jami hajm 20 MB dan oshmasligi kerak");
    out.push(toEntry(path, new Uint8Array(await f.arrayBuffer())));
    if (out.length > STARTER_MAX_FILES) break;
  }
  return check(stripCommonRoot(out));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
