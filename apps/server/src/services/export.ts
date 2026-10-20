import ExcelJS from "exceljs";
import { BRAND, computeFinalScore, CriteriaList, sumPenalties } from "@exam-ide/shared";
import type { Criterion } from "@exam-ide/shared";
import { prisma } from "../db.js";

// Natijalar Excel eksporti. Bu versiyada baholashni faqat o'qituvchi qiladi (AI o'chiq):
// o'qituvchi bahosi, jarimalar, yakuniy ball (= baho − jarimalar, bekor qilingan = 0). Baholanmaganlar ajratiladi.

export async function buildResultsWorkbook(examId: string): Promise<ExcelJS.Workbook> {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
  const attempts = await prisma.attempt.findMany({
    where: { examId },
    omit: { files: true, token: true },
    include: {
      penalties: { select: { points: true } },
      _count: { select: { events: { where: { severity: { in: ["WARN", "DANGER"] } } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  let criteria: Criterion[] = [];
  try {
    criteria = CriteriaList.parse(exam.criteria);
  } catch {
    criteria = [];
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  const ws = wb.addWorksheet("Natijalar");

  const columns: Partial<ExcelJS.Column>[] = [
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
  if (exam.aiEnabled) criteria.forEach((c, i) => columns.push({ header: c.name, key: `crit${i}`, width: 12 }));
  columns.push({ header: "Izoh", key: "comment", width: 50 });
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };

  const statusText: Record<string, string> = {
    JOINED: "Kutmoqda",
    WORKING: "Ishlamoqda",
    SUBMITTED: "Topshirdi",
    ANNULLED: "Bekor qilingan",
  };

  attempts.forEach((a, i) => {
    const teacherCrit = Array.isArray(a.teacherCriteria)
      ? (a.teacherCriteria as { name: string; score: number }[])
      : null;
    const row: Record<string, string | number> = {
      n: i + 1,
      name: a.studentName,
      teacher: a.teacherScore ?? "—",
      penalties: sumPenalties(a.penalties),
      final: a.status !== "ANNULLED" && a.teacherScore === null && a.aiScore === null ? "—" : computeFinalScore(a),
      status: statusText[a.status] ?? a.status,
      graded: a.status === "ANNULLED" ? "—" : a.teacherScore !== null || a.aiScore !== null ? "Baholangan" : "Baholanmagan",
      warnings: a._count.events,
      comment: a.teacherComment ?? "",
    };
    if (exam.aiEnabled) {
      criteria.forEach((c, j) => {
        const score = teacherCrit?.find((t) => t.name === c.name)?.score;
        row[`crit${j}`] = score ?? "—";
      });
    }
    const added = ws.addRow(row);
    if (row.graded === "Baholanmagan") {
      added.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CC" } };
      });
    }
  });

  return wb;
}
