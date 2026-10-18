import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { TeacherCreateInput } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { requireAdmin } from "../lib/auth.js";
import { HttpError, IdParams } from "../lib/http.js";
import { uz } from "../uz.js";

const teacherSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const;

export async function teacherRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/teachers", async () =>
    prisma.teacher.findMany({ select: teacherSelect, orderBy: { createdAt: "asc" } }),
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
    return reply.code(201).send(teacher);
  });

  app.delete("/api/teachers/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (id === req.teacher.id) throw new HttpError(400, uz.cannotDeleteSelf);
    const deleted = await prisma.teacher.deleteMany({ where: { id } });
    if (deleted.count === 0) throw new HttpError(404, uz.notFound);
    return reply.code(204).send();
  });
}
