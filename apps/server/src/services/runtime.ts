import type { FastifyBaseLogger } from "fastify";
import { SUBMIT_GRACE_MS, TIME_SYNC_INTERVAL_MS } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { rooms, students } from "../realtime/io.js";
import { attemptEndsAt } from "./attempts.js";
import { notifyAttempt, notifyExam, notifyLobby } from "./notify.js";
import { examReadonlyFiles, mergeStudentFiles, starterFiles } from "./workspace.js";

// Imtihon jarayoni: boshlash, server timeri, topshirish, imtihonni yakunlash.
// Holat bazada; xotirada faqat 15 soniyalik topshirish taymerlari (server qayta ishga tushsa, tick ularni qayta yaratadi).

const ending = new Map<string, NodeJS.Timeout>();

export function isEnding(attemptId: string): boolean {
  return ending.has(attemptId);
}

/** O'quvchiga exam:ended yuboradi va 15 soniyadan so'ng oxirgi snapshot bilan SUBMITTED qiladi. */
export function beginEnding(attemptId: string, log?: FastifyBaseLogger): void {
  if (ending.has(attemptId)) return;
  students().to(rooms.attempt(attemptId)).emit("exam:ended");
  const timer = setTimeout(() => {
    submitAttempt(attemptId).catch((err: unknown) => log?.error(err));
  }, SUBMIT_GRACE_MS);
  ending.set(attemptId, timer);
}

async function submitAttempt(attemptId: string): Promise<void> {
  ending.delete(attemptId);
  const updated = await prisma.attempt.updateMany({
    where: { id: attemptId, status: "WORKING" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (updated.count > 0) await notifyAttempt(attemptId);
}

/** Barcha ishlar topshirilgach: GRADING (AI yoqilgan bo'lsa) yoki FINISHED, kod bo'shatiladi. */
/**
 * AI baholash navbati (8-bosqich) ulanganda true qilinadi. Hozircha AI yoqilgan imtihon ham FINISHED ga o'tadi,
 * aks holda u GRADING da abadiy qolib ketardi (o'chirib ham bo'lmasdi).
 */
export const AI_GRADER_READY = false;

async function completeExam(examId: string, aiEnabled: boolean): Promise<void> {
  const grade = aiEnabled && AI_GRADER_READY;
  const updated = await prisma.exam.updateMany({
    where: { id: examId, status: "RUNNING" },
    data: { status: grade ? "GRADING" : "FINISHED", code: null },
  });
  if (updated.count === 0) return;
  if (aiEnabled && !grade) await markAiUnavailable(examId);
  // Bekor qilingan o'quvchilar hali ishlayotgan bo'lishi mumkin — ularni ham yopamiz.
  students().to(rooms.exam(examId)).emit("exam:ended");
  notifyExam(await prisma.exam.findUniqueOrThrow({ where: { id: examId } }));
  // 8-bosqich: shu yerda AI baholash navbatiga qo'yiladi.
}

/** O'quvchi ishlarida AI bahosi yo'qligi sababini aniq yozib qo'yadi (panelda "AI: xato" ko'rinadi). */
async function markAiUnavailable(examId: string): Promise<void> {
  await prisma.attempt.updateMany({
    where: { examId, aiScore: null, aiError: null },
    data: { aiError: AI_NOT_READY_ERROR },
  });
}

const AI_NOT_READY_ERROR = "AI baholash hali ulanmagan — o'qituvchi qo'lda baholaydi";

/** Eski versiyada GRADING da qolib ketgan imtihonlarni FINISHED ga o'tkazadi (grader yo'q paytda). */
async function releaseStuckGrading(): Promise<void> {
  if (AI_GRADER_READY) return;
  const stuck = await prisma.exam.findMany({ where: { status: "GRADING" }, select: { id: true } });
  for (const { id } of stuck) {
    await prisma.exam.update({ where: { id }, data: { status: "FINISHED", code: null } });
    await markAiUnavailable(id);
  }
}

export async function startExam(examId: string) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { tasks: true } });
  // Bazada har o'quvchiga faqat boshlang'ich fayllar; o'qituvchi materiallari (savollar.md, dizaynlar/, Figma) yuborishda qo'shiladi.
  const starter = starterFiles(exam);
  const files = mergeStudentFiles(await examReadonlyFiles(exam), starter);
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + exam.durationMin * 60_000);
  const [, started] = await prisma.$transaction([
    prisma.attempt.updateMany({ where: { examId, status: "JOINED" }, data: { status: "WORKING", files: starter } }),
    prisma.exam.update({ where: { id: examId }, data: { status: "RUNNING", startedAt, endsAt } }),
  ]);
  students()
    .to(rooms.exam(examId))
    .emit("exam:started", { endsAt: endsAt.toISOString(), serverNow: new Date().toISOString(), files });
  notifyExam(started);
  await notifyLobby(examId);
  return started;
}

/** "Imtihonni tugatish": hamma ishlayotganlar uchun darhol tugash jarayoni (exam:ended + 15 s). */
export async function finishExamNow(examId: string, log?: FastifyBaseLogger) {
  const exam = await prisma.exam.update({ where: { id: examId }, data: { endsAt: new Date() } });
  const working = await prisma.attempt.findMany({ where: { examId, status: "WORKING" }, select: { id: true } });
  for (const a of working) beginEnding(a.id, log);
  notifyExam(exam);
  return exam;
}

export function sendTimeSync(attemptId: string, endsAt: Date): void {
  students()
    .to(rooms.attempt(attemptId))
    .emit("time:sync", { endsAt: endsAt.toISOString(), serverNow: new Date().toISOString() });
}

async function runningExams() {
  return prisma.exam.findMany({
    where: { status: "RUNNING" },
    select: {
      id: true,
      endsAt: true,
      aiEnabled: true,
      attempts: { where: { status: "WORKING" }, select: { id: true, extraMinutes: true } },
    },
  });
}

/** Har soniyada: vaqti tugagan o'quvchilarni topshirishga o'tkazadi, hamma topshirgan imtihonni yakunlaydi. */
async function tick(log: FastifyBaseLogger): Promise<void> {
  const now = Date.now();
  for (const exam of await runningExams()) {
    if (!exam.endsAt) continue;
    for (const a of exam.attempts) {
      const endsAt = attemptEndsAt(exam.endsAt, a.extraMinutes);
      if (endsAt && now >= endsAt.getTime()) beginEnding(a.id, log);
    }
    if (exam.attempts.length === 0 && now >= exam.endsAt.getTime()) {
      await completeExam(exam.id, exam.aiEnabled);
    }
  }
}

async function syncAllTimes(): Promise<void> {
  for (const exam of await runningExams()) {
    for (const a of exam.attempts) {
      const endsAt = attemptEndsAt(exam.endsAt, a.extraMinutes);
      if (endsAt) sendTimeSync(a.id, endsAt);
    }
  }
}

export function startRuntime(log: FastifyBaseLogger): () => void {
  releaseStuckGrading().catch((err: unknown) => log.error(err));
  let busy = false;
  const tickTimer = setInterval(() => {
    if (busy) return;
    busy = true;
    tick(log)
      .catch((err: unknown) => log.error(err))
      .finally(() => {
        busy = false;
      });
  }, 1000);
  const syncTimer = setInterval(() => {
    syncAllTimes().catch((err: unknown) => log.error(err));
  }, TIME_SYNC_INTERVAL_MS);
  return () => {
    clearInterval(tickTimer);
    clearInterval(syncTimer);
    for (const t of ending.values()) clearTimeout(t);
    ending.clear();
  };
}
