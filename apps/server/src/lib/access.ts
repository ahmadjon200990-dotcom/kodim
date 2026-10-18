import type { AuthTeacher } from "./auth.js";
import { prisma } from "../db.js";
import { uz } from "../uz.js";
import { HttpError } from "./http.js";

function canAccess(teacher: AuthTeacher, ownerId: string): boolean {
  return teacher.role === "ADMIN" || teacher.id === ownerId;
}

/** O'qituvchi o'z imtihonini (admin — har qandayini) oladi, aks holda 404. */
export async function getOwnedExam(teacher: AuthTeacher, examId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam || !canAccess(teacher, exam.teacherId)) throw new HttpError(404, uz.examNotFound);
  return exam;
}

export async function getOwnedAttempt(teacher: AuthTeacher, attemptId: string) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
  if (!attempt || !canAccess(teacher, attempt.exam.teacherId)) throw new HttpError(404, uz.attemptNotFound);
  return attempt;
}
