// Excel natijalar va topshirilgan ishlar .zip — brauzerda (eski apps/server/src/services/export.ts, archive.ts bilan bir xil).
// Ma'lumot RLS orqali; o'qituvchi faqat o'z imtihonini oladi. Kutubxonalar faqat yuklab olishda (dinamik import).
import { BRAND, CriteriaList, isIgnoredPath, isReadonlyPath, uniqueFolderNames, type Criterion } from "@exam-ide/shared";
import type { AttemptDetail } from "./types";
import { api } from "./api";
import { supabase } from "./supabase";
import { ApiError } from "./backend";

async function attemptFiles(attemptId: string): Promise<{ path: string; content: string; encoding: string | null }[]> {
  const { data, error } = await supabase.from("attempt_files").select("path, content, encoding").eq("attempt_id", attemptId);
  if (error) throw new ApiError(500, error.message);
  return data;
}

async function addFiles(zip: import("jszip"), attemptId: string): Promise<void> {
  for (const f of await attemptFiles(attemptId)) {
    if (isIgnoredPath(f.path) || isReadonlyPath(f.path)) continue;
    zip.file(f.path, f.content, f.encoding === "base64" ? { base64: true } : {});
  }
}

export async function attemptZip(attemptId: string): Promise<{ name: string; blob: Blob }> {
  const { default: JSZip } = await import("jszip");
  const a = await api.get<AttemptDetail>(`/attempts/${attemptId}`);
  const zip = new JSZip();
  const [folder] = uniqueFolderNames([a.studentName]);
  await addFiles(zip.folder(folder!)!, attemptId);
  return { name: folder!, blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }) };
}

export async function examZip(examId: string): Promise<{ name: string; blob: Blob }> {
  const { default: JSZip } = await import("jszip");
  const { data: exam, error } = await supabase.from("exams").select("title").eq("id", examId).maybeSingle();
  if (error || !exam) throw new ApiError(404, "Imtihon topilmadi");
  const { data: attempts } = await supabase
    .from("attempts")
    .select("id, student_name")
    .eq("exam_id", examId)
    .neq("status", "JOINED")
    .order("student_name");
  const list = attempts ?? [];
  const zip = new JSZip();
  const names = uniqueFolderNames(list.map((a) => a.student_name));
  for (const [i, a] of list.entries()) await addFiles(zip.folder(names[i]!)!, a.id);
  const name = exam.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "_") || "ishlar";
  return { name, blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }) };
}

const STATUS_TEXT: Record<string, string> = {
  JOINED: "Kutmoqda",
  WORKING: "Ishlamoqda",
  SUBMITTED: "Topshirdi",
  ANNULLED: "Bekor qilingan",
};

/** Natijalar Excel'i: o'qituvchi bahosi, jarimalar, yakuniy ball; baholanmaganlar sariq. */
export async function resultsWorkbook(examId: string): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const { data: exam, error } = await supabase.from("exams").select("ai_enabled, criteria").eq("id", examId).maybeSingle();
  if (error || !exam) throw new ApiError(404, "Imtihon topilmadi");
  const { data: rows } = await supabase.from("attempt_summaries").select("*").eq("exam_id", examId).order("created_at");

  let criteria: Criterion[] = [];
  try {
    criteria = CriteriaList.parse(exam.criteria);
  } catch {
    criteria = [];
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  const ws = wb.addWorksheet("Natijalar");
  const columns: { header: string; key: string; width: number }[] = [
    { header: "№", key: "n", width: 5 },
    { header: "Ism", key: "name", width: 26 },
    { header: "O'qituvchi bahosi", key: "teacher", width: 17 },
    { header: "Jarimalar", key: "penalties", width: 11 },
    { header: "Yakuniy ball", key: "final", width: 13 },
    { header: "Holat", key: "status", width: 14 },
    { header: "Baholash", key: "graded", width: 14 },
    { header: "Ogohlantirishlar", key: "warnings", width: 16 },
  ];
  // Mezonlar faqat AI yoqilgan (keyingi versiya) imtihonlarda.
  if (exam.ai_enabled) criteria.forEach((c, i) => columns.push({ header: c.name, key: `crit${i}`, width: 12 }));
  columns.push({ header: "Izoh", key: "comment", width: 50 });
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };

  (rows ?? []).forEach((a, i) => {
    const teacherCrit = Array.isArray(a.teacher_criteria) ? (a.teacher_criteria as { name: string; score: number }[]) : null;
    const ungraded = a.teacher_score === null && a.ai_score === null;
    const row: Record<string, string | number> = {
      n: i + 1,
      name: a.student_name ?? "",
      teacher: a.teacher_score ?? "—",
      penalties: a.penalty_total ?? 0,
      final: a.status !== "ANNULLED" && ungraded ? "—" : (a.final_score ?? 0),
      status: STATUS_TEXT[a.status ?? ""] ?? a.status ?? "",
      graded: a.status === "ANNULLED" ? "—" : ungraded ? "Baholanmagan" : "Baholangan",
      warnings: a.warning_count ?? 0,
      comment: a.teacher_comment ?? "",
    };
    if (exam.ai_enabled) {
      criteria.forEach((c, j) => {
        row[`crit${j}`] = teacherCrit?.find((t) => t.name === c.name)?.score ?? "—";
      });
    }
    const added = ws.addRow(row);
    if (row.graded === "Baholanmagan") {
      added.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CC" } };
      });
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
