import type { FastifyInstance } from "fastify";
import { ExamInput, ExtendInput } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { getOwnedExam } from "../lib/access.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, IdParams } from "../lib/http.js";
import { attemptEndsAt } from "../services/attempts.js";
import { openExamWithCode } from "../services/exam-code.js";
import { notifyAttempt, notifyExam } from "../services/notify.js";
import { buildResultsWorkbook } from "../services/export.js";
import { finishExamNow, sendTimeSync, startExam } from "../services/runtime.js";
import { uz } from "../uz.js";

function examData(input: ExamInput) {
  return {
    title: input.title,
    durationMin: input.durationMin,
    template: input.template,
    starterFiles: input.starterFiles,
    referenceFiles: input.referenceFiles,
    criteria: input.criteria,
    aiEnabled: input.aiEnabled,
    aiModel: input.aiModel,
    allowedPackages: input.allowedPackages,
    allowedCommands: input.allowedCommands,
  };
}

function taskData(input: ExamInput) {
  return input.tasks.map((t, order) => ({
    order,
    title: t.title,
    description: t.description,
    type: t.type,
    figmaUrl: t.type === "FIGMA" ? (t.figmaUrl ?? null) : null,
    images: t.type === "FIGMA" ? t.images : [],
    expectedOutput: t.expectedOutput ?? null,
  }));
}

const withTasks = { tasks: { orderBy: { order: "asc" } } } as const;

export async function examRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/exams", async (req) =>
    prisma.exam.findMany({
      where: req.teacher.role === "ADMIN" ? {} : { teacherId: req.teacher.id },
      select: {
        id: true,
        title: true,
        status: true,
        code: true,
        durationMin: true,
        startedAt: true,
        endsAt: true,
        createdAt: true,
        teacher: { select: { id: true, name: true } },
        _count: { select: { attempts: true, tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.post("/api/exams", async (req, reply) => {
    const input = ExamInput.parse(req.body);
    const exam = await prisma.exam.create({
      data: { ...examData(input), teacherId: req.teacher.id, tasks: { create: taskData(input) } },
      include: withTasks,
    });
    return reply.code(201).send(exam);
  });

  app.get("/api/exams/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    await getOwnedExam(req.teacher, id);
    return prisma.exam.findUniqueOrThrow({ where: { id }, include: withTasks });
  });

  app.put("/api/exams/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    if (exam.status !== "DRAFT") throw new HttpError(409, uz.examNotEditable);
    const input = ExamInput.parse(req.body);
    const [, updated] = await prisma.$transaction([
      prisma.task.deleteMany({ where: { examId: id } }),
      prisma.exam.update({
        where: { id },
        data: { ...examData(input), tasks: { create: taskData(input) } },
        include: withTasks,
      }),
    ]);
    return updated;
  });

  app.delete("/api/exams/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    if (exam.status === "LOBBY" || exam.status === "RUNNING" || exam.status === "GRADING") {
      throw new HttpError(409, uz.examNotDeletable);
    }
    await prisma.exam.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/api/exams/:id/open", async (req) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    if (exam.status !== "DRAFT") throw new HttpError(409, uz.examMustBeDraft);
    const opened = await openExamWithCode(id);
    notifyExam(opened);
    return opened;
  });

  app.post("/api/exams/:id/start", async (req) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    if (exam.status !== "LOBBY") throw new HttpError(409, uz.examMustBeLobby);
    return startExam(id);
  });

  app.post("/api/exams/:id/extend", async (req) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    if (exam.status !== "RUNNING" || !exam.endsAt) throw new HttpError(409, uz.examMustBeRunning);
    const input = ExtendInput.parse(req.body);
    if (input.attemptId) {
      const updated = await prisma.attempt.updateMany({
        where: { id: input.attemptId, examId: id },
        data: { extraMinutes: { increment: input.minutes } },
      });
      if (updated.count === 0) throw new HttpError(404, uz.attemptNotInExam);
      const attempt = await prisma.attempt.findUniqueOrThrow({
        where: { id: input.attemptId },
        select: { id: true, extraMinutes: true },
      });
      const endsAt = attemptEndsAt(exam.endsAt, attempt.extraMinutes);
      if (endsAt) sendTimeSync(attempt.id, endsAt);
      await notifyAttempt(attempt.id);
      return attempt;
    }
    const updated = await prisma.exam.update({
      where: { id },
      data: { endsAt: new Date(exam.endsAt.getTime() + input.minutes * 60_000) },
    });
    const working = await prisma.attempt.findMany({
      where: { examId: id, status: "WORKING" },
      select: { id: true, extraMinutes: true },
    });
    for (const a of working) {
      const endsAt = attemptEndsAt(updated.endsAt, a.extraMinutes);
      if (endsAt) sendTimeSync(a.id, endsAt);
    }
    notifyExam(updated);
    return updated;
  });

  app.post("/api/exams/:id/finish", async (req) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    if (exam.status !== "RUNNING") throw new HttpError(409, uz.examMustBeRunning);
    return finishExamNow(id, req.log);
  });

  app.get("/api/exams/:id/export.xlsx", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    const wb = await buildResultsWorkbook(id);
    const safeName = exam.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "natijalar";
    reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("content-disposition", `attachment; filename="${encodeURIComponent(safeName)}.xlsx"`);
    await wb.xlsx.write(reply.raw);
    reply.raw.end();
    return reply;
  });
}
