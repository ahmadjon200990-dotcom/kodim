import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import type { Namespace } from "socket.io";
import {
  STUDENT_NAMESPACE,
  TEACHER_NAMESPACE,
  type StudentClientToServer,
  type StudentServerToClient,
  type TeacherClientToServer,
  type TeacherServerToClient,
} from "@exam-ide/shared";
import type { AuthTeacher } from "../lib/auth.js";

export interface StudentSocketData {
  attemptId?: string;
  examId?: string;
}

export interface TeacherSocketData {
  teacher?: AuthTeacher;
}

type NoEvents = Record<string, never>;
export type StudentNsp = Namespace<StudentClientToServer, StudentServerToClient, NoEvents, StudentSocketData>;
export type TeacherNsp = Namespace<TeacherClientToServer, TeacherServerToClient, NoEvents, TeacherSocketData>;

export const rooms = {
  exam: (examId: string) => `exam:${examId}`,
  attempt: (attemptId: string) => `attempt:${attemptId}`,
  watch: (examId: string) => `watch:${examId}`,
};

let studentNsp: StudentNsp | null = null;
let teacherNsp: TeacherNsp | null = null;

export function students(): StudentNsp {
  if (!studentNsp) throw new Error("Socket.io ishga tushirilmagan");
  return studentNsp;
}

export function teachers(): TeacherNsp {
  if (!teacherNsp) throw new Error("Socket.io ishga tushirilmagan");
  return teacherNsp;
}

export function createRealtime(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: { origin: true },
    // attempt:sync bir nechta 1 MB gacha faylni olib kelishi mumkin.
    maxHttpBufferSize: 25 * 1024 * 1024,
  });
  studentNsp = io.of(STUDENT_NAMESPACE) as StudentNsp;
  teacherNsp = io.of(TEACHER_NAMESPACE) as TeacherNsp;
  app.addHook("onClose", async () => {
    io.disconnectSockets(true);
  });
  return { students: studentNsp, teachers: teacherNsp };
}
