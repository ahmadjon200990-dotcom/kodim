import type { Exam, Prisma } from "@prisma/client";
import { computeFinalScore, sumPenalties } from "@exam-ide/shared";
import type { AttemptSummary, ExamLive, ExamPublic } from "@exam-ide/shared";
import { z } from "zod";
import { prisma } from "../db.js";

const summaryQuery = {
  omit: { files: true, aiResult: true, teacherCriteria: true, token: true },
  include: {
    penalties: { select: { points: true } },
    _count: { select: { events: { where: { severity: { in: ["WARN", "DANGER"] } } } } },
  },
} satisfies Prisma.AttemptDefaultArgs;

type SummaryRow = Prisma.AttemptGetPayload<typeof summaryQuery>;

function toSummary(a: SummaryRow): AttemptSummary {
  return {
    id: a.id,
    studentName: a.studentName,
    status: a.status,
    connected: a.connected,
    extraMinutes: a.extraMinutes,
    lastSeenAt: a.lastSeenAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
    aiScore: a.aiScore,
    aiError: a.aiError,
    teacherScore: a.teacherScore,
    gradedBy: a.gradedBy,
    penaltyTotal: sumPenalties(a.penalties),
    warningCount: a._count.events,
    finalScore: computeFinalScore(a),
  };
}

export async function listAttemptSummaries(examId: string): Promise<AttemptSummary[]> {
  const rows = await prisma.attempt.findMany({ ...summaryQuery, where: { examId }, orderBy: { createdAt: "asc" } });
  return rows.map(toSummary);
}

export async function getAttemptSummary(attemptId: string): Promise<AttemptSummary | null> {
  const row = await prisma.attempt.findUnique({ ...summaryQuery, where: { id: attemptId } });
  return row ? toSummary(row) : null;
}

const PackageList = z.array(z.string()).catch([]);

export function examPublic(exam: Exam): ExamPublic {
  return {
    id: exam.id,
    title: exam.title,
    durationMin: exam.durationMin,
    template: exam.template,
    status: exam.status,
    allowedPackages: PackageList.parse(exam.allowedPackages),
  };
}

export function examLive(exam: Exam): ExamLive {
  return {
    ...examPublic(exam),
    code: exam.code,
    startedAt: exam.startedAt?.toISOString() ?? null,
    endsAt: exam.endsAt?.toISOString() ?? null,
    aiEnabled: exam.aiEnabled,
  };
}

/** O'quvchining shaxsiy tugash vaqti: imtihon endsAt + extraMinutes. */
export function attemptEndsAt(examEndsAt: Date | null, extraMinutes: number): Date | null {
  return examEndsAt ? new Date(examEndsAt.getTime() + extraMinutes * 60_000) : null;
}
