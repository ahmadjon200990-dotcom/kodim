import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { LoginInput } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { uz } from "../uz.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (req) => {
    const input = LoginInput.parse(req.body);
    const teacher = await prisma.teacher.findUnique({ where: { email: input.email } });
    if (!teacher || !(await bcrypt.compare(input.password, teacher.passwordHash))) {
      throw new HttpError(401, uz.loginFailed);
    }
    const token = await app.jwt.sign({ sub: teacher.id });
    return { token, teacher: { id: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role } };
  });

  app.get("/api/me", { preHandler: requireAuth }, async (req) => req.teacher);
}
