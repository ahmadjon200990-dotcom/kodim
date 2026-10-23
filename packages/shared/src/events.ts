// Socket.io event nomlari va payload tiplari (CLAUDE.md 6.2).
// Event nomlari quyidagi interfeyslarning kalitlari; socket.io generic'lari bilan ishlatiladi.
import { z } from "zod";
import { EventType, FileEntry } from "./types.js";
import type { ShellKind } from "./commands.js";
import type {
  AttemptStatus,
  EventSeverity,
  ExamStatus,
  ExamTemplate,
  GradedBy,
} from "./types.js";

export const STUDENT_NAMESPACE = "/student";
export const TEACHER_NAMESPACE = "/teacher";

/** Vaqt tugagach (yoki "Topshirish"dan keyin) oxirgi sync uchun kutish. */
export const SUBMIT_GRACE_MS = 15_000;
export const TIME_SYNC_INTERVAL_MS = 30_000;
/** Shundan uzoq uzilishda DISCONNECTED yoziladi. */
export const DISCONNECT_REPORT_MS = 10_000;

export const EVENT_SEVERITY: Record<EventType, EventSeverity> = {
  FOCUS_LOST: "WARN",
  FORBIDDEN_PROCESS: "DANGER",
  EXTRA_DISPLAY: "WARN",
  DANGEROUS_COMMAND: "DANGER",
  UNKNOWN_PACKAGE: "WARN",
  EXTERNAL_FILE_CHANGE: "DANGER",
  LARGE_INSERT: "WARN",
  READONLY_TAMPER: "WARN",
  PASTE_BLOCKED: "WARN",
  DISCONNECTED: "WARN",
  RECONNECTED: "INFO",
  APP_CLOSED: "DANGER",
  AI_INJECTION: "DANGER",
  TERMINAL_COMMAND: "INFO",
  DEVICE_CHANGED: "DANGER",
  LATE_JOIN: "INFO",
  WINDOW_MINIMIZED: "WARN",
  SCREENSHOT_ATTEMPT: "WARN",
  COPY_OUT_ATTEMPT: "WARN",
  DROP_BLOCKED: "WARN",
  BLOCKED_COMMAND: "DANGER",
  DEVTOOLS_ATTEMPT: "WARN",
  BROWSER_BLOCKED: "WARN",
  ENV_MISSING: "WARN",
};

/** Bu turlarni faqat server yaratadi; klient yuborsa rad etiladi. */
export const SERVER_ONLY_EVENT_TYPES: readonly EventType[] = [
  "DISCONNECTED",
  "RECONNECTED",
  "APP_CLOSED",
  "AI_INJECTION",
  "DEVICE_CHANGED",
  "LATE_JOIN",
];

// ---------- Kirish payloadlari (server zod bilan tekshiradi) ----------

export const StudentJoinInput = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
  name: z.string().trim().min(2).max(60),
  token: z.string().min(1).max(200).optional(),
  /** Desktop ilova userData da bir marta yaratadigan doimiy qurilma ID si. */
  deviceId: z.string().trim().min(8).max(100),
});
export type StudentJoinInput = z.input<typeof StudentJoinInput>;

export const AttemptSyncInput = z.object({
  /**
   * O'zgargan yoki yangi fayllar. Yo'l va hajm bu yerda emas, server tomonida har bir fayl uchun
   * alohida tekshiriladi — bitta yaroqsiz fayl butun sync'ni buzmasin (`SyncRejection`).
   */
  files: z
    .array(z.object({ path: z.string().min(1).max(1000), content: z.string(), encoding: z.enum(["base64"]).optional() }))
    .max(300)
    .default([]),
  /** O'chirilgan fayllar yo'llari. */
  deleted: z.array(z.string().min(1).max(260)).max(300).default([]),
});
export type AttemptSyncInput = z.input<typeof AttemptSyncInput>;

export const EventReportInput = z.object({
  type: EventType.refine((t) => !SERVER_ONLY_EVENT_TYPES.includes(t)),
  details: z
    .record(z.string(), z.unknown())
    .default({})
    .refine((d) => JSON.stringify(d).length <= 10_000),
  /** Avval yuborilgan eventni yangilash (masalan FOCUS_LOST davomiyligi). */
  eventId: z.string().min(1).optional(),
});
export type EventReportInput = z.input<typeof EventReportInput>;

export const ExamWatchInput = z.object({ examId: z.string().min(1) });
export type ExamWatchInput = z.input<typeof ExamWatchInput>;

// ---------- Javob va server payloadlari ----------

export type AckResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T> = (res: AckResult<T>) => void;

export interface ExamPublic {
  id: string;
  title: string;
  durationMin: number;
  template: ExamTemplate;
  status: ExamStatus;
  /** Ruxsat etilgan npm paketlar (UNKNOWN_PACKAGE tekshiruvi uchun). */
  allowedPackages: string[];
  /** Terminalda ruxsat etilgan buyruq naqshlari (CLAUDE.md 3). */
  allowedCommands: string[];
  /** Ruxsat etilgan terminal profillari (bo'sh — hammasi). */
  allowedShells: ShellKind[];
}

export interface ExamLive extends ExamPublic {
  code: string | null;
  startedAt: string | null;
  endsAt: string | null;
  aiEnabled: boolean;
}

export type StudentPhase = "LOBBY" | "WORKING" | "SUBMITTED";

export interface StudentState {
  phase: StudentPhase;
  joinedCount: number;
  /** O'quvchining shaxsiy tugash vaqti (imtihon endsAt + extraMinutes). */
  endsAt: string | null;
  serverNow: string;
  /** Faqat WORKING holatida: ish papkasi tarkibi (oxirgi snapshot). */
  files: FileEntry[] | null;
  /** 15 s topshirish jarayoni boshlangan (Supabase: attempts.ending_at) — klient oxirgi sync'ni yuborib qulflanadi. */
  ending?: boolean;
}

export interface StudentJoinOk {
  token: string;
  attemptId: string;
  exam: ExamPublic;
  state: StudentState;
}

export interface SyncRejection {
  path: string;
  reason: "IGNORED" | "READONLY" | "TOO_LARGE" | "BINARY" | "TOO_MANY_FILES" | "INVALID_PATH";
}

export interface TimeSyncPayload {
  endsAt: string;
  serverNow: string;
}

export interface StudentClientToServer {
  "student:join": (payload: StudentJoinInput, ack: Ack<StudentJoinOk>) => void;
  "attempt:sync": (payload: AttemptSyncInput, ack: Ack<{ rejected: SyncRejection[] }>) => void;
  "event:report": (payload: EventReportInput, ack: Ack<{ eventId: string }>) => void;
  "attempt:submit": (ack: Ack<object>) => void;
}

export interface StudentServerToClient {
  "exam:started": (payload: TimeSyncPayload & { files: FileEntry[] }) => void;
  "time:sync": (payload: TimeSyncPayload) => void;
  /** Kutish xonasidagi kirganlar soni. */
  "lobby:count": (payload: { joinedCount: number }) => void;
  /** Oxirgi sync'ni yuborib, editorni qulflash kerak. */
  "exam:ended": () => void;
}

export interface AttemptSummary {
  id: string;
  studentName: string;
  status: AttemptStatus;
  connected: boolean;
  extraMinutes: number;
  lastSeenAt: string;
  submittedAt: string | null;
  aiScore: number | null;
  aiError: string | null;
  teacherScore: number | null;
  gradedBy: GradedBy;
  penaltyTotal: number;
  /** WARN va DANGER eventlar soni. */
  warningCount: number;
  finalScore: number;
}

export interface EventDto {
  id: string;
  attemptId: string;
  type: string;
  severity: EventSeverity;
  details: unknown;
  createdAt: string;
}

export interface EventWithStudent {
  studentName: string;
  event: EventDto;
}

/** exam:watch qaytaradigan eventlar soni (eng yangilari). */
export const WATCH_EVENTS_LIMIT = 300;

export interface TeacherClientToServer {
  /** Javobda oxirgi eventlar ham bor — sahifa yangilanganda yoki qayta ulanganda hech narsa yo'qolmasin. */
  "exam:watch": (
    payload: ExamWatchInput,
    ack: Ack<{ exam: ExamLive; attempts: AttemptSummary[]; events: EventWithStudent[] }>,
  ) => void;
}

export interface TeacherServerToClient {
  "lobby:update": (payload: { examId: string; attempts: AttemptSummary[] }) => void;
  "attempt:update": (payload: { examId: string; attempt: AttemptSummary }) => void;
  /** Yangi yoki yangilangan event (panel `event.id` bo'yicha yangilaydi). */
  "event:new": (payload: { examId: string; studentName: string; event: EventDto }) => void;
  /** Imtihon holati o'zgardi (RUNNING, GRADING, FINISHED, vaqt qo'shildi). */
  "exam:update": (payload: { exam: ExamLive }) => void;
}
