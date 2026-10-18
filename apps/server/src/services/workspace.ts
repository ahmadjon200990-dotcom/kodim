import { DESIGNS_DIR, FileList, isReadonlyPath, QUESTIONS_FILE } from "@exam-ide/shared";
import type { Exam, Task } from "@prisma/client";
import type { FileEntry } from "@exam-ide/shared";
import { TEMPLATES } from "./templates.js";

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

function questionsMarkdown(exam: Exam, tasks: Task[]): string {
  const parts = [`# ${exam.title}`, ""];
  tasks.forEach((task, i) => {
    parts.push(`## ${i + 1}. ${task.title}`, "");
    if (task.description.trim()) parts.push(task.description.trim(), "");
    if (task.type === "FIGMA") parts.push(`Dizayn: \`${designPath(task, i)}\``, "");
  });
  return parts.join("\n");
}

/** Imtihon boshlanganda o'quvchi ish papkasiga yoziladigan fayllar. */
export function buildInitialFiles(exam: Exam, tasks: Task[]): FileEntry[] {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const base = exam.template === "CUSTOM" ? FileList.parse(exam.starterFiles) : TEMPLATES[exam.template];
  const files = base.filter((f) => !isReadonlyPath(f.path));

  files.push({ path: QUESTIONS_FILE, content: questionsMarkdown(exam, ordered) });
  ordered.forEach((task, i) => {
    if (task.type !== "FIGMA" || !task.figmaUrl) return;
    files.push({ path: designPath(task, i), content: `# ${task.title}\n\nFigma: ${task.figmaUrl}\n` });
  });
  return files;
}
