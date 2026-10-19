import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { BRAND } from "@exam-ide/shared";
import { env } from "./env.js";
import { HttpError } from "./lib/http.js";
import { authRoutes } from "./routes/auth.js";
import { teacherRoutes } from "./routes/teachers.js";
import { examRoutes } from "./routes/exams.js";
import { attemptRoutes } from "./routes/attempts.js";
import { createRealtime } from "./realtime/io.js";
import { registerStudentHandlers } from "./realtime/student.js";
import { registerTeacherHandlers } from "./realtime/teacher.js";
import { startRuntime } from "./services/runtime.js";
import { uz } from "./uz.js";

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

  // Panel dev rejimida (Vite) boshqa portda ishlaydi.
  await app.register(cors, { origin: true });
  await app.register(fastifyJwt, { secret: env.JWT_SECRET, sign: { expiresIn: "12h" } });
  app.decorateRequest("teacher");

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: uz.validation, issues: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    const status = typeof err === "object" && err !== null && "statusCode" in err ? Number(err.statusCode) : 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: err instanceof Error ? err.message : uz.validation });
    }
    req.log.error(err);
    return reply.code(500).send({ error: uz.internal });
  });

  app.get("/api/health", async () => ({ ok: true, name: BRAND.name }));
  await app.register(authRoutes);
  await app.register(teacherRoutes);
  await app.register(examRoutes);
  await app.register(attemptRoutes);

  const realtime = createRealtime(app);
  registerStudentHandlers(realtime.students, app.log);
  registerTeacherHandlers(realtime.teachers, app);
  const stopRuntime = startRuntime(app.log);
  app.addHook("onClose", async () => stopRuntime());

  // O'qituvchi paneli (build qilingan): apps/server/public. SPA — noma'lum yo'llar index.html ga.
  const publicDir = fileURLToPath(new URL("../public", import.meta.url));
  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api")) return reply.code(404).send({ error: uz.notFound });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
