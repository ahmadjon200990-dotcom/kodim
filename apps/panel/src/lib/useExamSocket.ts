import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { TEACHER_NAMESPACE } from "@exam-ide/shared";
import type {
  AttemptSummary,
  EventDto,
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
}

export interface ExamLiveState {
  exam: ExamLive | null;
  attempts: AttemptSummary[];
  alerts: LiveAlert[];
  connected: boolean;
  /** Yangi DANGER/WARN kelganda oshadi — ovozli signal uchun. */
  alertTick: number;
}

/** O'qituvchi paneli uchun jonli imtihon holati (socket). */
export function useExamSocket(examId: string | undefined): ExamLiveState {
  const [state, setState] = useState<ExamLiveState>({
    exam: null,
    attempts: [],
    alerts: [],
    connected: false,
    alertTick: 0,
  });
  const socketRef = useRef<TeacherSocket | null>(null);

  useEffect(() => {
    if (!examId) return;
    const socket: TeacherSocket = io(TEACHER_NAMESPACE, {
      transports: ["websocket"],
      auth: { token: tokenStore.get() ?? "" },
    });
    socketRef.current = socket;

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
        if (res.ok) setState((s) => ({ ...s, exam: res.exam, attempts: res.attempts }));
      });
    });
    socket.on("disconnect", () => setState((s) => ({ ...s, connected: false })));
    socket.on("lobby:update", ({ attempts }) => setState((s) => ({ ...s, attempts })));
    socket.on("attempt:update", ({ attempt }) => setState((s) => ({ ...s, attempts: upsert(s.attempts, attempt) })));
    socket.on("exam:update", ({ exam }) => setState((s) => ({ ...s, exam })));
    socket.on("event:new", ({ studentName, event }) => {
      setState((s) => {
        const alert: LiveAlert = { key: event.id, studentName, event };
        const alerts = [alert, ...s.alerts.filter((a) => a.key !== event.id)].slice(0, 100);
        const louder = event.severity !== "INFO";
        return { ...s, alerts, alertTick: louder ? s.alertTick + 1 : s.alertTick };
      });
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [examId]);

  return state;
}
