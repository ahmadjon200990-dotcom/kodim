import type { Event, Exam } from "@prisma/client";
import { EVENT_SEVERITY } from "@exam-ide/shared";
import type { EventDto, EventType } from "@exam-ide/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { rooms, students, teachers } from "../realtime/io.js";
import { examLive, getAttemptSummary, listAttemptSummaries } from "./attempts.js";

// O'qituvchi paneliga (va kutish xonasidagi o'quvchilarga) jonli xabarlar.

export async function notifyAttempt(attemptId: string): Promise<void> {
  const attempt = await getAttemptSummary(attemptId);
  if (!attempt) return;
  const { examId } = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { examId: true } });
  teachers().to(rooms.watch(examId)).emit("attempt:update", { examId, attempt });
}

export async function notifyLobby(examId: string): Promise<void> {
  const attempts = await listAttemptSummaries(examId);
  teachers().to(rooms.watch(examId)).emit("lobby:update", { examId, attempts });
  students().to(rooms.exam(examId)).emit("lobby:count", { joinedCount: attempts.length });
}

export function notifyExam(exam: Exam): void {
  teachers().to(rooms.watch(exam.id)).emit("exam:update", { exam: examLive(exam) });
}

function toDto(e: Event): EventDto {
  return {
    id: e.id,
    attemptId: e.attemptId,
    type: e.type,
    severity: e.severity,
    details: e.details,
    createdAt: e.createdAt.toISOString(),
  };
}

async function emitEvent(event: Event): Promise<void> {
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: event.attemptId },
    select: { examId: true, studentName: true },
  });
  teachers()
    .to(rooms.watch(attempt.examId))
    .emit("event:new", { examId: attempt.examId, studentName: attempt.studentName, event: toDto(event) });
  if (event.severity !== "INFO") await notifyAttempt(event.attemptId);
}

/** Eventni saqlaydi va o'qituvchiga darhol yuboradi. */
export async function recordEvent(attemptId: string, type: EventType, details: Prisma.InputJsonObject = {}) {
  const event = await prisma.event.create({
    data: { attemptId, type, severity: EVENT_SEVERITY[type], details },
  });
  await emitEvent(event);
  return event;
}

/** Mavjud event tafsilotlarini to'ldiradi (masalan FOCUS_LOST davomiyligi) va qayta yuboradi. */
export async function updateEventDetails(eventId: string, details: Prisma.InputJsonObject) {
  const current = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const base = current.details && typeof current.details === "object" && !Array.isArray(current.details) ? current.details : {};
  const event = await prisma.event.update({ where: { id: eventId }, data: { details: { ...base, ...details } } });
  await emitEvent(event);
  return event;
}
