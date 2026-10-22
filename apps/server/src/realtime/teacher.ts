import type { FastifyInstance } from "fastify";
import { ExamWatchInput } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { getOwnedExam } from "../lib/access.js";
import { examLive, listAttemptSummaries } from "../services/attempts.js";
import { recentExamEvents } from "../services/notify.js";
import { uz } from "../uz.js";
import { rooms, type TeacherNsp } from "./io.js";
import { respond } from "./util.js";

export function registerTeacherHandlers(nsp: TeacherNsp, app: FastifyInstance): void {
  // Ulanishda JWT: io("/teacher", { auth: { token } }).
  nsp.use((socket, next) => {
    void (async () => {
      const token: unknown = socket.handshake.auth.token;
      if (typeof token !== "string") throw new Error();
      const { sub } = app.jwt.verify<{ sub: string }>(token);
      const teacher = await prisma.teacher.findUnique({
        where: { id: sub },
        select: { id: true, name: true, email: true, role: true, disabled: true },
      });
      if (!teacher || teacher.disabled) throw new Error();
      socket.data.teacher = { id: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role };
    })().then(
      () => next(),
      () => next(new Error(uz.unauthorized)),
    );
  });

  nsp.on("connection", (socket) => {
    socket.on("exam:watch", (payload, ack) =>
      void respond(app.log, ack, async () => {
        const { examId } = ExamWatchInput.parse(payload);
        const teacher = socket.data.teacher;
        if (!teacher) throw new Error(uz.unauthorized);
        const exam = await getOwnedExam(teacher, examId);
        for (const room of socket.rooms) if (room.startsWith("watch:")) await socket.leave(room);
        await socket.join(rooms.watch(examId));
        return {
          exam: examLive(exam),
          attempts: await listAttemptSummaries(examId),
          events: await recentExamEvents(examId),
        };
      }),
    );
  });
}
