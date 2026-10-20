import { randomBytes } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Socket } from "socket.io";
import { z } from "zod";
import {
  AttemptSyncInput,
  DISCONNECT_REPORT_MS,
  EventReportInput,
  FileEntry,
  isIgnoredPath,
  isReadonlyPath,
  StudentJoinInput,
  SYNC_LIMITS,
} from "@exam-ide/shared";
import type {
  StudentClientToServer,
  StudentJoinOk,
  StudentPhase,
  StudentServerToClient,
  SyncRejection,
} from "@exam-ide/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../lib/http.js";
import { attemptEndsAt, examPublic } from "../services/attempts.js";
import { notifyAttempt, notifyLobby, recordEvent, updateEventDetails } from "../services/notify.js";
import { beginEnding, isEnding } from "../services/runtime.js";
import { buildInitialFiles } from "../services/workspace.js";
import { uz } from "../uz.js";
import { rooms, type StudentNsp, type StudentSocketData } from "./io.js";
import { respond, serialize } from "./util.js";

type StudentSocket = Socket<StudentClientToServer, StudentServerToClient, Record<string, never>, StudentSocketData>;

const StoredFiles = z.array(FileEntry);

/** Uzilish 10 soniyadan oshsa DISCONNECTED yoziladi; shu attempt'lar qayta ulanganda RECONNECTED oladi. */
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const reportedDisconnect = new Set<string>();

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

async function hasLiveSocket(nsp: StudentNsp, attemptId: string): Promise<boolean> {
  return (await nsp.in(rooms.attempt(attemptId)).fetchSockets()).length > 0;
}

function joined(socket: StudentSocket): { attemptId: string; examId: string } {
  const { attemptId, examId } = socket.data;
  if (!attemptId || !examId) throw new HttpError(401, uz.studentNotJoined);
  return { attemptId, examId };
}

function phaseOf(status: string): StudentPhase {
  if (status === "JOINED") return "LOBBY";
  if (status === "WORKING") return "WORKING";
  return "SUBMITTED";
}

async function join(nsp: StudentNsp, socket: StudentSocket, payload: unknown): Promise<StudentJoinOk> {
  const input = StudentJoinInput.parse(payload);
  const exam = await prisma.exam.findUnique({ where: { code: input.code }, include: { tasks: true } });
  if (!exam || (exam.status !== "LOBBY" && exam.status !== "RUNNING")) throw new HttpError(404, uz.badExamCode);

  // 1) token bo'yicha, 2) ism bo'yicha (token yo'qolgan bo'lsa), 3) yangi o'quvchi.
  let attempt = input.token ? await prisma.attempt.findUnique({ where: { token: input.token } }) : null;
  if (attempt && attempt.examId !== exam.id) attempt = null;
  let byName = false;
  if (!attempt) {
    const all = await prisma.attempt.findMany({ where: { examId: exam.id } });
    const same = all.find((a) => normalizeName(a.studentName) === normalizeName(input.name));
    if (same) {
      if (await hasLiveSocket(nsp, same.id)) throw new HttpError(409, uz.nameTaken);
      attempt = same;
      byName = true;
    }
  }
  const created = !attempt;
  attempt ??= await prisma.attempt.create({
    data: {
      examId: exam.id,
      studentName: input.name.replace(/\s+/g, " "),
      token: randomBytes(24).toString("base64url"),
      deviceId: input.deviceId,
      // Imtihon boshlangandan keyin kirgan o'quvchi darhol ishlaydi.
      status: exam.status === "RUNNING" ? "WORKING" : "JOINED",
      files: exam.status === "RUNNING" ? buildInitialFiles(exam, exam.tasks) : [],
    },
  });
  const attemptId = attempt.id;
  const previousDeviceId = attempt.deviceId;

  // Bitta ish — bitta faol ulanish: eski ulanishlarni uzamiz (shu socket qayta join qilsa, o'zini emas).
  nsp.in(rooms.attempt(attemptId)).except(socket.id).disconnectSockets(true);
  const prev = socket.data;
  if (prev.attemptId && prev.examId && prev.attemptId !== attemptId) {
    await socket.leave(rooms.attempt(prev.attemptId));
    await socket.leave(rooms.exam(prev.examId));
  }
  await socket.join([rooms.exam(exam.id), rooms.attempt(attemptId)]);
  socket.data = { attemptId, examId: exam.id };

  clearTimeout(disconnectTimers.get(attemptId));
  disconnectTimers.delete(attemptId);
  const wasReported = reportedDisconnect.delete(attemptId);
  attempt = await prisma.attempt.update({
    where: { id: attemptId },
    data: { connected: true, lastSeenAt: new Date(), deviceId: input.deviceId },
  });

  if (created && exam.status === "RUNNING" && exam.startedAt) {
    const minutesAfterStart = Math.round((Date.now() - exam.startedAt.getTime()) / 60_000);
    await recordEvent(attemptId, "LATE_JOIN", { minutesAfterStart });
  }
  if (!created && previousDeviceId && previousDeviceId !== input.deviceId) {
    // Shu ish boshqa kompyuterdan davom ettirilmoqda.
    await recordEvent(attemptId, "DEVICE_CHANGED", {
      byName,
      previousDeviceId,
      deviceId: input.deviceId,
    });
  }

  const working = attempt.status === "WORKING" && exam.status === "RUNNING";
  if (working && (wasReported || byName)) {
    await recordEvent(attemptId, "RECONNECTED", { byName, afterDisconnect: wasReported });
  }
  if (working && isEnding(attemptId)) {
    // Topshirish jarayonida qayta ulandi — klient oxirgi sync'ni yuborishi uchun.
    setImmediate(() => socket.emit("exam:ended"));
  }
  await notifyLobby(exam.id);

  const endsAt = attemptEndsAt(exam.endsAt, attempt.extraMinutes);
  return {
    token: attempt.token,
    attemptId,
    exam: examPublic(exam),
    state: {
      phase: phaseOf(attempt.status),
      joinedCount: await prisma.attempt.count({ where: { examId: exam.id } }),
      endsAt: endsAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      files: attempt.status === "WORKING" ? StoredFiles.parse(attempt.files) : null,
    },
  };
}

async function sync(attemptId: string, payload: unknown): Promise<{ rejected: SyncRejection[] }> {
  const input = AttemptSyncInput.parse(payload);
  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true, files: true } });
  if (attempt.status !== "WORKING") throw new HttpError(409, uz.notWorking);

  // Readonly/binar fayllar (dizayn rasmlari, savollar.md) o'zgarmaydi — ularni to'liq (encoding bilan) saqlaymiz.
  const files = new Map(StoredFiles.parse(attempt.files).map((f) => [f.path, f]));
  const rejected: SyncRejection[] = [];
  for (const path of input.deleted) {
    if (isReadonlyPath(path)) rejected.push({ path, reason: "READONLY" });
    else files.delete(path);
  }
  for (const f of input.files) {
    if (!FileEntry.shape.path.safeParse(f.path).success) rejected.push({ path: f.path, reason: "INVALID_PATH" });
    else if (isIgnoredPath(f.path)) rejected.push({ path: f.path, reason: "IGNORED" });
    else if (isReadonlyPath(f.path)) rejected.push({ path: f.path, reason: "READONLY" });
    else if (Buffer.byteLength(f.content, "utf8") > SYNC_LIMITS.maxFileBytes) rejected.push({ path: f.path, reason: "TOO_LARGE" });
    else if (f.content.includes("\u0000")) rejected.push({ path: f.path, reason: "BINARY" });
    else if (!files.has(f.path) && files.size >= SYNC_LIMITS.maxFiles) rejected.push({ path: f.path, reason: "TOO_MANY_FILES" });
    else files.set(f.path, { path: f.path, content: f.content });
  }
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { files: [...files.values()], lastSeenAt: new Date() },
  });
  return { rejected };
}

async function report(attemptId: string, payload: unknown): Promise<{ eventId: string }> {
  const input = EventReportInput.parse(payload);
  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true } });
  if (attempt.status !== "JOINED" && attempt.status !== "WORKING") throw new HttpError(409, uz.notWorking);
  const details = input.details as Prisma.InputJsonObject;
  if (input.eventId) {
    const existing = await prisma.event.findUnique({ where: { id: input.eventId }, select: { attemptId: true } });
    if (existing?.attemptId !== attemptId) throw new HttpError(404, uz.notFound);
    await updateEventDetails(input.eventId, details);
    return { eventId: input.eventId };
  }
  const event = await recordEvent(attemptId, input.type, details);
  return { eventId: event.id };
}

async function submit(attemptId: string, log: FastifyBaseLogger): Promise<object> {
  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true } });
  if (attempt.status !== "WORKING") throw new HttpError(409, uz.notWorking);
  beginEnding(attemptId, log);
  return {};
}

async function onDisconnect(nsp: StudentNsp, socket: StudentSocket, reason: string): Promise<void> {
  const { attemptId, examId } = socket.data;
  // Shu ish uchun yangi ulanish ochilgani sababli uzildi — hech narsa qilmaymiz.
  if (!attemptId || !examId || reason === "server namespace disconnect") return;
  if (await hasLiveSocket(nsp, attemptId)) return;

  const attempt = await prisma.attempt
    .update({ where: { id: attemptId }, data: { connected: false, lastSeenAt: new Date() }, select: { status: true } })
    .catch(() => null); // imtihon o'chirilgan bo'lishi mumkin
  if (!attempt) return;

  const working = attempt.status === "WORKING" && !isEnding(attemptId);
  if (working && reason === "client namespace disconnect") {
    // Ilova o'zi uzildi (yopildi).
    reportedDisconnect.add(attemptId);
    await recordEvent(attemptId, "APP_CLOSED", { reason });
  } else if (working) {
    disconnectTimers.set(
      attemptId,
      setTimeout(() => {
        disconnectTimers.delete(attemptId);
        void (async () => {
          if (await hasLiveSocket(nsp, attemptId)) return;
          reportedDisconnect.add(attemptId);
          await recordEvent(attemptId, "DISCONNECTED", { reason, afterMs: DISCONNECT_REPORT_MS });
        })().catch(() => undefined);
      }, DISCONNECT_REPORT_MS),
    );
  }
  if (attempt.status === "JOINED") await notifyLobby(examId);
  else await notifyAttempt(attemptId);
}

export function registerStudentHandlers(nsp: StudentNsp, log: FastifyBaseLogger): void {
  nsp.on("connection", (socket) => {
    socket.on("student:join", (payload, ack) => void respond(log, ack, () => join(nsp, socket, payload)));
    socket.on("attempt:sync", (payload, ack) =>
      void respond(log, ack, async () => {
        const { attemptId } = joined(socket);
        return serialize(`sync:${attemptId}`, () => sync(attemptId, payload));
      }),
    );
    socket.on("event:report", (payload, ack) => void respond(log, ack, () => report(joined(socket).attemptId, payload)));
    socket.on("attempt:submit", (ack) => void respond(log, ack, () => submit(joined(socket).attemptId, log)));
    socket.on("disconnect", (reason) => {
      onDisconnect(nsp, socket, reason).catch((err: unknown) => log.error(err));
    });
  });
}
