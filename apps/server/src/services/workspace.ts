import { readonlyFiles, type FileEntry, type ReadyFigmaFiles } from "@exam-ide/shared";
import type { Exam, Task } from "@prisma/client";
import { examFilesCache, loadReadyFigma, type ReadyFigma } from "./figma.js";

// Ish papkasi tarkibi `@exam-ide/shared` (examFiles.ts) da — bu yerda faqat Figma kesh va Prisma bog'lanishi.
export { mergeStudentFiles, starterFiles } from "@exam-ide/shared";

function toFiles(figma: Map<string, ReadyFigma>): Map<string, ReadyFigmaFiles> {
  const out = new Map<string, ReadyFigmaFiles>();
  for (const [url, ready] of figma) {
    const images = new Map<string, { format: string; base64: string }>();
    for (const [id, img] of ready.images) images.set(id, { format: img.format, base64: img.bytes.toString("base64") });
    out.set(url, { design: ready.design, images });
  }
  return out;
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
  const files = readonlyFiles(exam, exam.tasks, toFiles(figma));
  examFilesCache.set(exam.id, { at: Date.now(), value: files });
  return files;
}
