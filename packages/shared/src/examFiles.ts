// O'quvchi ish papkasi tarkibi (CLAUDE.md 0.2, 0.7): shablon fayllari va o'qituvchi materiallari
// (savollar.md, dizaynlar/). Sof funksiyalar — panel (Supabase) va eski server bir xil natija oladi.
import { FIGMA_DESIGN_FILE, FIGMA_DIR, type FigmaDesign } from "./figma.js";
import { TEMPLATE_FILES as TEMPLATES } from "./templates.js";
import { DesignImage, FileList, type FileEntry } from "./types.js";
import { DESIGNS_DIR, isReadonlyPath, QUESTIONS_FILE } from "./workspace.js";

export interface ExamFilesInput {
  title: string;
  template: string;
  /** CUSTOM shablonda o'qituvchi yuklagan fayllar (tekshirilmagan JSON). */
  starterFiles?: unknown;
}

export interface TaskFilesInput {
  title: string;
  order: number;
  description: string;
  type: string;
  figmaUrl?: string | null;
  /** `DesignImage[]` (tekshirilmagan JSON). */
  images?: unknown;
}

/** Tayyor Figma dizayni: daraxt + freym rasmlari (base64). */
export interface ReadyFigmaFiles {
  design: FigmaDesign;
  images: Map<string, { format: string; base64: string }>;
}

const STARTERS = TEMPLATES as Partial<Record<string, readonly FileEntry[]>>;
const ImageList = DesignImage.array().catch([]);

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

function designPath(task: TaskFilesInput, index: number): string {
  return `${DESIGNS_DIR}/${index + 1}-${slug(task.title)}.md`;
}

function designDir(task: TaskFilesInput, index: number): string {
  return `${DESIGNS_DIR}/${index + 1}-${slug(task.title)}`;
}

function questionsMarkdown(exam: ExamFilesInput, tasks: TaskFilesInput[], figma: Map<string, ReadyFigmaFiles>): string {
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
function figmaFiles(dir: string, ready: ReadyFigmaFiles): FileEntry[] {
  const files: FileEntry[] = [];
  const frames = ready.design.frames.map((f, i) => {
    const img = ready.images.get(f.id);
    if (!img) return { ...f, image: null };
    const path = `${dir}/${FIGMA_DIR}/${i + 1}-${fileSafe(f.name)}.${img.format}`;
    files.push({ path, content: img.base64, encoding: "base64" });
    return { ...f, image: path };
  });
  const design: FigmaDesign = { ...ready.design, frames };
  files.unshift({ path: `${dir}/${FIGMA_DIR}/${FIGMA_DESIGN_FILE}`, content: JSON.stringify(design) });
  return files;
}

/** Shablon yoki o'qituvchi yuklagan boshlang'ich fayllar (o'quvchi o'zgartiradi). */
export function starterFiles(exam: ExamFilesInput): FileEntry[] {
  const base = exam.template === "CUSTOM" ? FileList.parse(exam.starterFiles) : (STARTERS[exam.template] ?? []);
  return base.filter((f) => !isReadonlyPath(f.path)).map((f) => ({ ...f }));
}

/** O'qituvchi materiallari: savollar.md va dizaynlar/ (faqat o'qish). */
export function readonlyFiles(
  exam: ExamFilesInput,
  tasks: readonly TaskFilesInput[],
  figma: Map<string, ReadyFigmaFiles> = new Map(),
): FileEntry[] {
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

/** Imtihon boshlanganda o'quvchi ish papkasiga yoziladigan fayllar. */
export function buildInitialFiles(
  exam: ExamFilesInput,
  tasks: readonly TaskFilesInput[],
  figma: Map<string, ReadyFigmaFiles> = new Map(),
): FileEntry[] {
  return [...starterFiles(exam), ...readonlyFiles(exam, tasks, figma)];
}

/** O'quvchiga yuboriladigan to'liq papka: o'qituvchi materiallari + o'quvchining (saqlangan) fayllari. */
export function mergeStudentFiles(readonly: FileEntry[], stored: FileEntry[]): FileEntry[] {
  return [...readonly, ...stored.filter((f) => !isReadonlyPath(f.path))];
}
