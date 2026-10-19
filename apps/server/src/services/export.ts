import ExcelJS from "exceljs";
import { BRAND, computeFinalScore, CriteriaList, sumPenalties } from "@exam-ide/shared";
import type { Criterion } from "@exam-ide/shared";
import { prisma } from "../db.js";

// Natijalar Excel eksporti (CLAUDE.md 6.4).

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
    { header: "AI ball", key: "ai", width: 9 },
    { header: "O'qituvchi ball", key: "teacher", width: 15 },
    { header: "Jarimalar", key: "penalties", width: 11 },
    { header: "Yakuniy ball", key: "final", width: 13 },
    { header: "Holat", key: "status", width: 14 },
    { header: "Ogohlantirishlar", key: "warnings", width: 16 },
  ];
  criteria.forEach((c, i) => columns.push({ header: c.name, key: `crit${i}`, width: 12 }));
  columns.push({ header: "Qisqa izoh", key: "comment", width: 50 });
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
      ai: a.aiScore ?? "—",
      teacher: a.teacherScore ?? "—",
      penalties: sumPenalties(a.penalties),
      final: computeFinalScore(a),
      status: statusText[a.status] ?? a.status,
      warnings: a._count.events,
      comment: a.teacherComment ?? "",
    };
    criteria.forEach((c, j) => {
      const score = teacherCrit?.find((t) => t.name === c.name)?.score;
      row[`crit${j}`] = score ?? "—";
    });
    ws.addRow(row);
  });

  return wb;
}
