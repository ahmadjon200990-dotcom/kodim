import JSZip from "jszip";
import { FileEntry, isIgnoredPath, isReadonlyPath, uniqueFolderNames } from "@exam-ide/shared";
import { z } from "zod";
import { prisma } from "../db.js";

// Topshirilgan ishlarni .zip qilib berish (CLAUDE.md "Demo Day 3", 6-talab).
// node_modules va boshqa e'tiborga olinmaydiganlar, o'qituvchi bergan faqat-o'qish fayllari (savollar.md, dizaynlar/) kirmaydi.

const StoredFiles = z.array(FileEntry).catch([]);

function addFiles(zip: JSZip, files: unknown): number {
  let n = 0;
  for (const f of StoredFiles.parse(files)) {
    if (isIgnoredPath(f.path) || isReadonlyPath(f.path)) continue;
    zip.file(f.path, f.content, f.encoding === "base64" ? { base64: true } : {});
    n++;
  }
  return n;
}

export async function attemptZip(attemptId: string): Promise<{ name: string; data: Buffer }> {
  const a = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { studentName: true, files: true } });
  const zip = new JSZip();
  const [folder] = uniqueFolderNames([a.studentName]);
  addFiles(zip.folder(folder!)!, a.files);
  return { name: folder!, data: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) };
}

export async function examZip(examId: string): Promise<{ name: string; data: Buffer }> {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, select: { title: true } });
  const attempts = await prisma.attempt.findMany({
    where: { examId, status: { not: "JOINED" } },
    select: { studentName: true, files: true },
    orderBy: { studentName: "asc" },
  });
  const zip = new JSZip();
  const names = uniqueFolderNames(attempts.map((a) => a.studentName));
  attempts.forEach((a, i) => addFiles(zip.folder(names[i]!)!, a.files));
  const name = exam.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "_") || "ishlar";
  return { name, data: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) };
}

/** Content-Disposition: o'zbekcha/UTF-8 nom bilan (RFC 5987) va ASCII zaxira nom. */
export function attachmentHeader(name: string, ext: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "") || "fayl";
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${name}.${ext}`)}`;
}
