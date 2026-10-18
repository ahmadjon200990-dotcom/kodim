import type { FastifyReply, FastifyRequest } from "fastify";
import type { TeacherRole } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { uz } from "../uz.js";
import { HttpError } from "./http.js";

export interface AuthTeacher {
  id: string;
  name: string;
  email: string;
  role: TeacherRole;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    teacher: AuthTeacher;
  }
}

/** JWT ni tekshiradi va o'qituvchini bazadan yuklaydi (o'chirilgan o'qituvchi tokeni ishlamaydi). */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    throw new HttpError(401, uz.unauthorized);
  }
  const teacher = await prisma.teacher.findUnique({
    where: { id: req.user.sub },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!teacher) throw new HttpError(401, uz.unauthorized);
  req.teacher = teacher;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (req.teacher.role !== "ADMIN") throw new HttpError(403, uz.forbidden);
}
