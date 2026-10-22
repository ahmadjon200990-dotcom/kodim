import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { TeacherCreateInput, TeacherRole } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { requireAdmin } from "../lib/auth.js";
import { HttpError, IdParams } from "../lib/http.js";
import { uz } from "../uz.js";

// Admin: o'qituvchilar ro'yxati, qo'shish, o'chirish (disable — ma'lumotlar saqlanadi), rolni o'zgartirish.

const teacherSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  disabled: true,
  createdAt: true,
  lastLoginAt: true,
  googleId: true,
  _count: { select: { exams: true } },
} as const;

type Row = { googleId: string | null; _count: { exams: number } } & Record<string, unknown>;
const toDto = ({ googleId, _count, ...t }: Row) => ({ ...t, google: googleId !== null, examCount: _count.exams });

const TeacherPatch = z.object({ role: TeacherRole.optional(), disabled: z.boolean().optional() });

export async function teacherRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/teachers", async () =>
    (await prisma.teacher.findMany({ select: teacherSelect, orderBy: { createdAt: "asc" } })).map(toDto),
  );

  app.post("/api/teachers", async (req, reply) => {
    const input = TeacherCreateInput.parse(req.body);
    if (await prisma.teacher.findUnique({ where: { email: input.email } })) {
      throw new HttpError(409, uz.emailTaken);
    }
    const teacher = await prisma.teacher.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, 10),
      },
      select: teacherSelect,
    });
    return reply.code(201).send(toDto(teacher));
  });

  app.patch("/api/teachers/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    const input = TeacherPatch.parse(req.body);
    if (id === req.teacher.id) throw new HttpError(400, uz.cannotChangeSelf);
    const exists = await prisma.teacher.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, uz.notFound);
    const updated = await prisma.teacher.update({ where: { id }, data: input, select: teacherSelect });
    req.log.info({ by: req.teacher.id, teacherId: id, ...input }, "admin: o'qituvchi o'zgartirildi");
    return toDto(updated);
  });

  app.delete("/api/teachers/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (id === req.teacher.id) throw new HttpError(400, uz.cannotDeleteSelf);
    const deleted = await prisma.teacher.deleteMany({ where: { id } });
    if (deleted.count === 0) throw new HttpError(404, uz.notFound);
    return reply.code(204).send();
  });
}
