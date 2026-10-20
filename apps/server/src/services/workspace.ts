import { DESIGNS_DIR, DesignImage, FileList, isReadonlyPath, QUESTIONS_FILE } from "@exam-ide/shared";
import type { Exam, Task } from "@prisma/client";
import { z } from "zod";
import type { FileEntry } from "@exam-ide/shared";
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

function questionsMarkdown(exam: Exam, tasks: Task[]): string {
  const parts = [`# ${exam.title}`, ""];
  tasks.forEach((task, i) => {
    parts.push(`## ${i + 1}. ${task.title}`, "");
    if (task.description.trim()) parts.push(task.description.trim(), "");
    if (task.type === "FIGMA") {
      const imgs = ImageList.parse(task.images);
      if (task.figmaUrl) parts.push(`Dizayn (Figma): \`${designPath(task, i)}\``, "");
      if (imgs.length) parts.push(`Dizayn rasmlari: \`${designDir(task, i)}/\` papkasida`, "");
    }
  });
  return parts.join("\n");
}

/** Imtihon boshlanganda o'quvchi ish papkasiga yoziladigan fayllar. */
export function buildInitialFiles(exam: Exam, tasks: Task[]): FileEntry[] {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const base = exam.template === "CUSTOM" ? FileList.parse(exam.starterFiles) : (TEMPLATE_FILES[exam.template] ?? []);
  const files: FileEntry[] = base.filter((f) => !isReadonlyPath(f.path)).map((f) => ({ ...f }));

  files.push({ path: QUESTIONS_FILE, content: questionsMarkdown(exam, ordered) });
  ordered.forEach((task, i) => {
    if (task.type !== "FIGMA") return;
    if (task.figmaUrl) {
      files.push({ path: designPath(task, i), content: `# ${task.title}\n\nFigma: ${task.figmaUrl}\n` });
    }
    const imgs = ImageList.parse(task.images);
    imgs.forEach((img, j) => {
      const base64 = img.dataUrl.slice(img.dataUrl.indexOf(",") + 1);
      files.push({ path: `${designDir(task, i)}/${imageFileName(img, j)}`, content: base64, encoding: "base64" });
    });
  });
  return files;
}
