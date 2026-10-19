import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { TEACHER_NAMESPACE, WATCH_EVENTS_LIMIT } from "@exam-ide/shared";
import type {
  AttemptSummary,
  EventDto,
  EventWithStudent,
  ExamLive,
  TeacherClientToServer,
  TeacherServerToClient,
} from "@exam-ide/shared";
import { tokenStore } from "./api";

type TeacherSocket = Socket<TeacherServerToClient, TeacherClientToServer>;

export interface LiveAlert {
  key: string;
  studentName: string;
  event: EventDto;
  /** Sahifa ochiq turganda jonli kelgan (tarixdan emas) — ajratib ko'rsatiladi. */
  fresh: boolean;
}

export interface ExamLiveState {
  exam: ExamLive | null;
  attempts: AttemptSummary[];
  alerts: LiveAlert[];
  connected: boolean;
  /** Oxirgi jonli DANGER/WARN — ovozli signal va toast uchun. */
  lastLoud: LiveAlert | null;
}

const byNewest = (a: LiveAlert, b: LiveAlert) => b.event.createdAt.localeCompare(a.event.createdAt);

/** Tarix (watch javobi) va jonli eventlarni id bo'yicha birlashtiradi — hech narsa yo'qolmaydi. */
function merge(current: LiveAlert[], incoming: LiveAlert[]): LiveAlert[] {
  const map = new Map(current.map((a) => [a.key, a]));
  for (const a of incoming) {
    const prev = map.get(a.key);
    map.set(a.key, prev ? { ...a, fresh: prev.fresh || a.fresh } : a);
  }
  return [...map.values()].sort(byNewest).slice(0, WATCH_EVENTS_LIMIT);
}

const fromHistory = (rows: EventWithStudent[]): LiveAlert[] =>
  rows.map((r) => ({ key: r.event.id, studentName: r.studentName, event: r.event, fresh: false }));

/** O'qituvchi paneli uchun jonli imtihon holati (socket). Qayta ulanishda tarix qayta yuklanadi. */
export function useExamSocket(examId: string | undefined): ExamLiveState {
  const [state, setState] = useState<ExamLiveState>({
    exam: null,
    attempts: [],
    alerts: [],
    connected: false,
    lastLoud: null,
  });

  useEffect(() => {
    if (!examId) return;
    const socket: TeacherSocket = io(TEACHER_NAMESPACE, {
      transports: ["websocket"],
      auth: { token: tokenStore.get() ?? "" },
    });

    const upsert = (attempts: AttemptSummary[], a: AttemptSummary) => {
      const i = attempts.findIndex((x) => x.id === a.id);
      if (i < 0) return [...attempts, a];
      const next = attempts.slice();
      next[i] = a;
      return next;
    };

    socket.on("connect", () => {
      setState((s) => ({ ...s, connected: true }));
      void socket.emitWithAck("exam:watch", { examId }).then((res) => {
        if (!res.ok) return;
        setState((s) => ({
          ...s,
          exam: res.exam,
          attempts: res.attempts,
          alerts: merge(s.alerts, fromHistory(res.events)),
        }));
      });
    });
    socket.on("disconnect", () => setState((s) => ({ ...s, connected: false })));
    socket.on("lobby:update", ({ attempts }) => setState((s) => ({ ...s, attempts })));
    socket.on("attempt:update", ({ attempt }) => setState((s) => ({ ...s, attempts: upsert(s.attempts, attempt) })));
    socket.on("exam:update", ({ exam }) => setState((s) => ({ ...s, exam })));
    socket.on("event:new", ({ studentName, event }) => {
      setState((s) => {
        const known = s.alerts.some((a) => a.key === event.id);
        const alert: LiveAlert = { key: event.id, studentName, event, fresh: true };
        // Yangilanish (masalan FOCUS_LOST davomiyligi) qayta signal bermaydi.
        const loud = !known && event.severity !== "INFO";
        return { ...s, alerts: merge(s.alerts, [alert]), lastLoud: loud ? alert : s.lastLoud };
      });
    });

    return () => {
      socket.close();
    };
  }, [examId]);

  return state;
}
