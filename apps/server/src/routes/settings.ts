import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { getOwnedExam } from "../lib/access.js";
import { requireAuth } from "../lib/auth.js";
import { encryptSecret } from "../lib/crypto.js";
import { HttpError, IdParams } from "../lib/http.js";
import { ensureExamFigma, examFigmaStatus, FigmaError, verifyFigmaToken } from "../services/figma.js";

// O'qituvchi sozlamalari (Figma tokeni) va imtihon Figma dizaynlari holati.
// Token faqat yoziladi: javoblarda hech qachon qaytarilmaydi (faqat "saqlangan" belgisi va Figma nomi).

const FigmaTokenInput = z.object({ token: z.string().trim().min(20).max(200) });

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/settings", async (req) => {
    const t = await prisma.teacher.findUniqueOrThrow({
      where: { id: req.teacher.id },
      select: { figmaToken: true, figmaHandle: true },
    });
    return { figma: { configured: Boolean(t.figmaToken), handle: t.figmaHandle } };
  });

  app.put("/api/settings/figma", async (req) => {
    const { token } = FigmaTokenInput.parse(req.body);
    let handle: string;
    try {
      ({ handle } = await verifyFigmaToken(token));
    } catch (err) {
      if (err instanceof FigmaError) throw new HttpError(err.code === "NETWORK" ? 502 : 400, err.message);
      throw err;
    }
    await prisma.teacher.update({
      where: { id: req.teacher.id },
      data: { figmaToken: encryptSecret(token), figmaHandle: handle || null },
    });
    return { figma: { configured: true, handle } };
  });

  app.delete("/api/settings/figma", async (req) => {
    await prisma.teacher.update({ where: { id: req.teacher.id }, data: { figmaToken: null, figmaHandle: null } });
    return { figma: { configured: false, handle: null } };
  });

  // ---- Imtihon Figma dizaynlari (tokeni — imtihon egasiniki)
  app.get("/api/exams/:id/figma", async (req) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    const tasks = await prisma.task.findMany({ where: { examId: id }, select: { type: true, figmaUrl: true } });
    return examFigmaStatus(exam.teacherId, tasks);
  });

  app.post("/api/exams/:id/figma/refresh", async (req) => {
    const { id } = IdParams.parse(req.params);
    const exam = await getOwnedExam(req.teacher, id);
    const tasks = await prisma.task.findMany({ where: { examId: id }, select: { type: true, figmaUrl: true } });
    await ensureExamFigma(exam.teacherId, tasks, true);
    return examFigmaStatus(exam.teacherId, tasks);
  });

  /** Freym rasmi (panelda oldindan ko'rish uchun). */
  app.get("/api/figma/:cacheId/frames/:frameId", async (req, reply) => {
    const { cacheId, frameId } = z.object({ cacheId: z.string().min(1), frameId: z.string().min(1) }).parse(req.params);
    const cache = await prisma.figmaCache.findUnique({ where: { id: cacheId }, select: { teacherId: true } });
    if (!cache || (cache.teacherId !== req.teacher.id && req.teacher.role !== "ADMIN")) throw new HttpError(404, "Topilmadi");
    const img = await prisma.figmaImage.findUnique({ where: { cacheId_frameId: { cacheId, frameId } } });
    if (!img) throw new HttpError(404, "Topilmadi");
    reply.header("content-type", img.format === "jpg" ? "image/jpeg" : "image/png");
    reply.header("cache-control", "private, max-age=3600");
    return reply.send(Buffer.from(img.bytes));
  });
}
