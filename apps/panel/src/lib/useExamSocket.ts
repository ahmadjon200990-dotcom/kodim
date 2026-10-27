import { useEffect, useState } from "react";
import { WATCH_EVENTS_LIMIT } from "@exam-ide/shared";
import type { AttemptSummary, EventDto, EventWithStudent, ExamLive } from "@exam-ide/shared";
import { api, ApiError, forceLogout } from "./api";
import { supabase } from "./supabase";

// Jonli kuzatuv — Supabase Realtime private kanal `exam:<id>` (MIGRATION-PLAN.md 7-faza). Xabarlarni DB trigger'lari
// yuboradi (eski socket /teacher bilan bir xil shakl): attempt:update, event:new, exam:update. Har (qayta) obunada
// holat qayta o'qiladi — uzilish paytidagi o'zgarishlar yo'qolmaydi.

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
  /** Imtihonni kuzatib bo'lmadi: "notFound" (yo'q / boshqa o'qituvchiniki) yoki "network" (server bilan aloqa yo'q). */
  error: { kind: "notFound" | "network"; message: string } | null;
}

const byNewest = (a: LiveAlert, b: LiveAlert) => b.event.createdAt.localeCompare(a.event.createdAt);

/** Tarix va jonli eventlarni id bo'yicha birlashtiradi — hech narsa yo'qolmaydi. */
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

/** Boshlang'ich holat: imtihon, o'quvchilar, oxirgi eventlar (eski `exam:watch` javobi). */
async function loadWatch(examId: string): Promise<{ exam: ExamLive; attempts: AttemptSummary[]; events: EventWithStudent[] }> {
  const { data: e, error } = await supabase.from("exams").select("*").eq("id", examId).maybeSingle();
  if (error) throw new ApiError(/jwt/i.test(error.message) ? 401 : 500, error.message);
  if (!e) throw new ApiError(404, "Imtihon topilmadi");
  const attempts = await api.get<AttemptSummary[]>(`/exams/${examId}/attempts`);
  const { data: rows } = await supabase
    .from("events")
    .select("id, attempt_id, type, severity, details, created_at, attempt:attempts(student_name)")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false })
    .limit(WATCH_EVENTS_LIMIT);
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    exam: {
      id: e.id,
      title: e.title,
      durationMin: e.duration_min,
      template: e.template,
      status: e.status,
      allowedPackages: strings(e.allowed_packages),
      allowedCommands: strings(e.allowed_commands),
      allowedShells: strings(e.allowed_shells) as ExamLive["allowedShells"],
      code: e.code,
      startedAt: e.started_at,
      endsAt: e.ends_at,
      aiEnabled: e.ai_enabled,
    },
    attempts,
    events: (rows ?? []).map((r) => ({
      studentName: (r.attempt as { student_name: string } | null)?.student_name ?? "",
      event: { id: r.id, attemptId: r.attempt_id, type: r.type, severity: r.severity, details: r.details, createdAt: r.created_at },
    })),
  };
}

/** O'qituvchi paneli uchun jonli imtihon holati. Qayta ulanishda holat va tarix qayta yuklanadi. */
export function useExamSocket(examId: string | undefined): ExamLiveState {
  const [state, setState] = useState<ExamLiveState>({
    exam: null,
    attempts: [],
    alerts: [],
    connected: false,
    lastLoud: null,
    error: null,
  });

  useEffect(() => {
    if (!examId) return;
    let alive = true;

    const upsert = (attempts: AttemptSummary[], a: AttemptSummary) => {
      const i = attempts.findIndex((x) => x.id === a.id);
      if (i < 0) return [...attempts, a];
      const next = attempts.slice();
      next[i] = a;
      return next;
    };

    const reload = () =>
      loadWatch(examId).then(
        (res) => {
          if (!alive) return;
          setState((s) => ({ ...s, error: null, exam: res.exam, attempts: res.attempts, alerts: merge(s.alerts, fromHistory(res.events)) }));
        },
        (err: unknown) => {
          if (!alive) return;
          if (err instanceof ApiError && err.status === 401) return forceLogout();
          const notFound = err instanceof ApiError && err.status === 404;
          setState((s) =>
            notFound
              ? { ...s, error: { kind: "notFound", message: err.message } }
              : s.exam
                ? s
                : { ...s, error: { kind: "network", message: err instanceof Error ? err.message : "" } },
          );
        },
      );

    const channel = supabase
      .channel(`exam:${examId}`, { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "exams", filter: `id=eq.${examId}` }, () => {
        void reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attempts", filter: `exam_id=eq.${examId}` }, () => {
        void reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `exam_id=eq.${examId}` }, () => {
        void reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "penalties" }, () => {
        void reload();
      })
      .on("broadcast", { event: "attempt:update" }, ({ payload }) => {
        const { attempt } = payload as { attempt: AttemptSummary | null };
        if (attempt) setState((s) => ({ ...s, attempts: upsert(s.attempts, attempt) }));
      })
      .on("broadcast", { event: "exam:update" }, ({ payload }) => {
        const { exam } = payload as { exam: ExamLive };
        setState((s) => ({ ...s, exam }));
      })
      .on("broadcast", { event: "event:new" }, ({ payload }) => {
        const { studentName, event } = payload as { studentName: string; event: EventDto };
        setState((s) => {
          const known = s.alerts.some((a) => a.key === event.id);
          const alert: LiveAlert = { key: event.id, studentName, event, fresh: true };
          // Yangilanish (masalan FOCUS_LOST davomiyligi) qayta signal bermaydi.
          const loud = !known && event.severity !== "INFO";
          return { ...s, alerts: merge(s.alerts, [alert]), lastLoud: loud ? alert : s.lastLoud };
        });
      });

    void reload();
    void supabase.realtime.setAuth().then(() =>
      channel.subscribe((status) => {
        if (!alive) return;
        if (status === "SUBSCRIBED") {
          setState((s) => ({ ...s, connected: true }));
          void reload();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setState((s) => ({ ...s, connected: false }));
        }
      }),
    );

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [examId]);

  return state;
}
