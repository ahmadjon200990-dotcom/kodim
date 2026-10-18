import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { computeFinalScore, CriteriaList, GradeInput, PenaltyInput, sumPenalties } from "@exam-ide/shared";
import type { GradedCriterion } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { getOwnedAttempt, getOwnedExam } from "../lib/access.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, IdParams } from "../lib/http.js";
import { listAttemptSummaries } from "../services/attempts.js";
import { notifyAttempt } from "../services/notify.js";
import { uz } from "../uz.js";

export async function attemptRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/exams/:id/attempts", async (req) => {
    const { id } = IdParams.parse(req.params);
    await getOwnedExam(req.teacher, id);
    return listAttemptSummaries(id);
  });

  app.get("/api/attempts/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    await getOwnedAttempt(req.teacher, id);
    const attempt = await prisma.attempt.findUniqueOrThrow({
      where: { id },
      omit: { token: true },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        penalties: { orderBy: { createdAt: "asc" }, include: { teacher: { select: { id: true, name: true } } } },
      },
    });
    return { ...attempt, penaltyTotal: sumPenalties(attempt.penalties), finalScore: computeFinalScore(attempt) };
  });

  app.post("/api/attempts/:id/penalties", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await getOwnedAttempt(req.teacher, id);
    const input = PenaltyInput.parse(req.body);
    if (input.eventId) {
      const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { attemptId: true } });
      if (event?.attemptId !== id) throw new HttpError(400, uz.eventNotFound);
    }
    const penalty = await prisma.penalty.create({
      data: {
        attemptId: id,
        points: input.points,
        reason: input.reason,
        eventId: input.eventId ?? null,
        teacherId: req.teacher.id,
      },
    });
    await notifyAttempt(id);
    return reply.code(201).send(penalty);
  });

  app.delete("/api/penalties/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const penalty = await prisma.penalty.findUnique({ where: { id }, select: { attemptId: true } });
    if (!penalty) throw new HttpError(404, uz.penaltyNotFound);
    await getOwnedAttempt(req.teacher, penalty.attemptId);
    await prisma.penalty.delete({ where: { id } });
    await notifyAttempt(penalty.attemptId);
    return reply.code(204).send();
  });

  app.post("/api/attempts/:id/annul", async (req) => {
    const { id } = IdParams.parse(req.params);
    const attempt = await getOwnedAttempt(req.teacher, id);
    if (attempt.status === "ANNULLED") throw new HttpError(409, uz.alreadyAnnulled);
    const updated = await prisma.attempt.update({ where: { id }, data: { status: "ANNULLED" }, omit: { files: true, token: true } });
    await notifyAttempt(id);
    return updated;
  });

  app.post("/api/attempts/:id/unannul", async (req) => {
    const { id } = IdParams.parse(req.params);
    const attempt = await getOwnedAttempt(req.teacher, id);
    if (attempt.status !== "ANNULLED") throw new HttpError(409, uz.notAnnulled);
    // Imtihon hali davom etsa va o'quvchi topshirmagan bo'lsa — ishlashda davom etadi.
    const status = attempt.submittedAt || attempt.exam.status !== "RUNNING" ? "SUBMITTED" : "WORKING";
    const updated = await prisma.attempt.update({ where: { id }, data: { status }, omit: { files: true, token: true } });
    await notifyAttempt(id);
    return updated;
  });

  app.put("/api/attempts/:id/grade", async (req) => {
    const { id } = IdParams.parse(req.params);
    const attempt = await getOwnedAttempt(req.teacher, id);
    const input = GradeInput.parse(req.body);

    let teacherScore = input.teacherScore;
    let teacherCriteria: GradedCriterion[] | undefined;
    if (input.criteria) {
      const examCriteria = CriteriaList.parse(attempt.exam.criteria);
      teacherCriteria = input.criteria.map((c) => {
        const def = examCriteria.find((e) => e.name === c.name);
        if (!def) throw new HttpError(400, uz.unknownCriterion(c.name));
        if (c.score > def.weight) throw new HttpError(400, uz.criterionOverWeight(c.name, def.weight));
        return { name: c.name, weight: def.weight, score: c.score, comment: c.comment };
      });
      teacherScore ??= teacherCriteria.reduce((s, c) => s + c.score, 0);
    }

    // teacherScore: null — o'qituvchi bahosi olib tashlanadi, AI bahosi (bo'lsa) qaytadi.
    const clearing = teacherScore === null;
    const updated = await prisma.attempt.update({
      where: { id },
      data: {
        ...(teacherScore !== undefined && { teacherScore }),
        ...(input.teacherComment !== undefined && { teacherComment: input.teacherComment }),
        ...(teacherCriteria && { teacherCriteria }),
        ...(clearing && { teacherCriteria: Prisma.DbNull }),
        gradedBy: clearing ? (attempt.aiScore !== null ? "AI" : "NONE") : "TEACHER",
      },
      omit: { files: true, token: true },
    });
    await notifyAttempt(id);
    return updated;
  });
}
