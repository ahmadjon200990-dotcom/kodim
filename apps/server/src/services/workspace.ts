import {
  DESIGNS_DIR,
  DesignImage,
  FIGMA_DESIGN_FILE,
  FIGMA_DIR,
  FileList,
  isReadonlyPath,
  QUESTIONS_FILE,
  type FigmaDesign,
} from "@exam-ide/shared";
import type { Exam, Task } from "@prisma/client";
import { z } from "zod";
import type { FileEntry } from "@exam-ide/shared";
import { examFilesCache, loadReadyFigma, type ReadyFigma } from "./figma.js";
import { TEMPLATES } from "./templates.js";

const TEMPLATE_FILES = TEMPLATES as Partial<Record<string, readonly FileEntry[]>>;
const ImageList = z.array(DesignImage).catch([]);

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function imageFileName(img: DesignImage, index: number): string {
  const safe = img.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  if (/\.[a-z0-9]+$/i.test(safe)) return safe;
  const mime = /^data:([^;]+);/i.exec(img.dataUrl)?.[1]?.toLowerCase() ?? "image/png";
  return `${safe || `dizayn-${index + 1}`}.${EXT[mime] ?? "png"}`;
}

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[ʻʼ'`‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "dizayn";
}

function designPath(task: Task, index: number): string {
  return `${DESIGNS_DIR}/${index + 1}-${slug(task.title)}.md`;
}

function designDir(task: Task, index: number): string {
  return `${DESIGNS_DIR}/${index + 1}-${slug(task.title)}`;
}

function questionsMarkdown(exam: Exam, tasks: Task[], figma: Map<string, ReadyFigma>): string {
  const parts = [`# ${exam.title}`, ""];
  tasks.forEach((task, i) => {
    parts.push(`## ${i + 1}. ${task.title}`, "");
    if (task.description.trim()) parts.push(task.description.trim(), "");
    // Dizayn rasmlari har qanday topshiriq turida bo'lishi mumkin; Figma havolasi — faqat FIGMA turida.
    const imgs = ImageList.parse(task.images);
    if (task.type === "FIGMA" && task.figmaUrl) {
      parts.push(`Dizayn (Figma): \`${designPath(task, i)}\``, "");
      if (figma.has(task.figmaUrl)) parts.push(`Dizaynni ko'rish (o'lchamlar, ranglar, shriftlar): \`${designDir(task, i)}/${FIGMA_DIR}/${FIGMA_DESIGN_FILE}\``, "");
    }
    if (imgs.length) parts.push(`Dizayn rasmlari: \`${designDir(task, i)}/\` papkasida`, "");
  });
  return parts.join("\n");
}

const fileSafe = (name: string) => name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "freym";

/** Figma dizayni: `design.json` (rasm yo'llari bilan) + freym rasmlari. */
function figmaFiles(dir: string, ready: ReadyFigma): FileEntry[] {
  const files: FileEntry[] = [];
  const frames = ready.design.frames.map((f, i) => {
    const img = ready.images.get(f.id);
    if (!img) return { ...f, image: null };
    const path = `${dir}/${FIGMA_DIR}/${i + 1}-${fileSafe(f.name)}.${img.format}`;
    files.push({ path, content: img.bytes.toString("base64"), encoding: "base64" });
    return { ...f, image: path };
  });
  const design: FigmaDesign = { ...ready.design, frames };
  files.unshift({ path: `${dir}/${FIGMA_DIR}/${FIGMA_DESIGN_FILE}`, content: JSON.stringify(design) });
  return files;
}

/** Imtihon boshlanganda o'quvchi ish papkasiga yoziladigan fayllar. */
export function buildInitialFiles(exam: Exam, tasks: Task[], figma: Map<string, ReadyFigma> = new Map()): FileEntry[] {
  return [...starterFiles(exam), ...readonlyFiles(exam, tasks, figma)];
}

/** Shablon yoki o'qituvchi yuklagan boshlang'ich fayllar (o'quvchi o'zgartiradi). */
export function starterFiles(exam: Exam): FileEntry[] {
  const base = exam.template === "CUSTOM" ? FileList.parse(exam.starterFiles) : (TEMPLATE_FILES[exam.template] ?? []);
  return base.filter((f) => !isReadonlyPath(f.path)).map((f) => ({ ...f }));
}

/** O'qituvchi materiallari: savollar.md va dizaynlar/ (faqat o'qish). */
function readonlyFiles(exam: Exam, tasks: Task[], figma: Map<string, ReadyFigma>): FileEntry[] {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const files: FileEntry[] = [{ path: QUESTIONS_FILE, content: questionsMarkdown(exam, ordered, figma) }];
  ordered.forEach((task, i) => {
    if (task.type === "FIGMA" && task.figmaUrl) {
      files.push({ path: designPath(task, i), content: `# ${task.title}\n\nFigma: ${task.figmaUrl}\n` });
      const ready = figma.get(task.figmaUrl);
      if (ready) files.push(...figmaFiles(designDir(task, i), ready));
    }
    const imgs = ImageList.parse(task.images);
    imgs.forEach((img, j) => {
      const base64 = img.dataUrl.slice(img.dataUrl.indexOf(",") + 1);
      files.push({ path: `${designDir(task, i)}/${imageFileName(img, j)}`, content: base64, encoding: "base64" });
    });
  });
  return files;
}

const READONLY_TTL_MS = 5 * 60_000;

/**
 * Imtihonning faqat-o'qish fayllari (Figma dizaynlari bilan). Har o'quvchi uchun bazada nusxa saqlanmaydi —
 * `Attempt.files` faqat o'quvchi fayllarini saqlaydi, o'qituvchi materiallari yuborishda qo'shiladi.
 */
export async function examReadonlyFiles(exam: Exam & { tasks: Task[] }): Promise<FileEntry[]> {
  const hit = examFilesCache.get(exam.id);
  if (hit && Date.now() - hit.at < READONLY_TTL_MS) return hit.value as FileEntry[];
  const figma = await loadReadyFigma(exam.teacherId, exam.tasks);
  const files = readonlyFiles(exam, exam.tasks, figma);
  examFilesCache.set(exam.id, { at: Date.now(), value: files });
  return files;
}

/** O'quvchiga yuboriladigan to'liq papka: o'qituvchi materiallari + o'quvchining (saqlangan) fayllari. */
export function mergeStudentFiles(readonly: FileEntry[], stored: FileEntry[]): FileEntry[] {
  return [...readonly, ...stored.filter((f) => !isReadonlyPath(f.path))];
}
