import { z } from "zod";
import { uzShared } from "./uz.js";

// ---------- Enumlar ----------

export const TeacherRole = z.enum(["ADMIN", "TEACHER"]);
export type TeacherRole = z.infer<typeof TeacherRole>;

export const ExamStatus = z.enum(["DRAFT", "LOBBY", "RUNNING", "GRADING", "FINISHED"]);
export type ExamStatus = z.infer<typeof ExamStatus>;

export const ExamTemplate = z.enum(["EMPTY", "HTML", "REACT_VITE", "CUSTOM"]);
export type ExamTemplate = z.infer<typeof ExamTemplate>;

export const TaskType = z.enum(["EXERCISE", "FIGMA"]);
export type TaskType = z.infer<typeof TaskType>;

export const AttemptStatus = z.enum(["JOINED", "WORKING", "SUBMITTED", "ANNULLED"]);
export type AttemptStatus = z.infer<typeof AttemptStatus>;

export const GradedBy = z.enum(["AI", "TEACHER", "NONE"]);
export type GradedBy = z.infer<typeof GradedBy>;

export const EventSeverity = z.enum(["INFO", "WARN", "DANGER"]);
export type EventSeverity = z.infer<typeof EventSeverity>;

export const EventType = z.enum([
  "FOCUS_LOST",
  "FORBIDDEN_PROCESS",
  "EXTRA_DISPLAY",
  "DANGEROUS_COMMAND",
  "UNKNOWN_PACKAGE",
  "EXTERNAL_FILE_CHANGE",
  "LARGE_INSERT",
  "READONLY_TAMPER",
  "PASTE_BLOCKED",
  "DISCONNECTED",
  "RECONNECTED",
  "APP_CLOSED",
  "AI_INJECTION",
  "TERMINAL_COMMAND",
]);
export type EventType = z.infer<typeof EventType>;

/** Imtihondagi `aiModel` maydoni: aniq model nomi emas, daraja. Server env'dan modelni tanlaydi. */
export const AiModelTier = z.enum(["DEFAULT", "STRONG"]);
export type AiModelTier = z.infer<typeof AiModelTier>;

export const DEFAULT_ALLOWED_PACKAGES = [
  "react",
  "react-dom",
  "vite",
  "@vitejs/plugin-react",
  "typescript",
  "@types/react",
  "@types/react-dom",
  "eslint",
] as const;

// ---------- Fayllar, mezonlar, topshiriqlar ----------

const filePath = z
  .string()
  .trim()
  .min(1)
  .max(260)
  .refine((p) => !p.startsWith("/") && !p.includes("\\") && !p.split("/").includes(".."), uzShared.filePathInvalid);

export const FileEntry = z.object({
  path: filePath,
  content: z.string().max(1_000_000),
});
export type FileEntry = z.infer<typeof FileEntry>;

export const FileList = z
  .array(FileEntry)
  .max(300)
  .refine((files) => new Set(files.map((f) => f.path)).size === files.length, uzShared.filePathDuplicate);

export const Criterion = z.object({
  name: z.string().trim().min(1).max(100),
  weight: z.number().int().min(1).max(100),
  description: z.string().max(2000).default(""),
});
export type Criterion = z.infer<typeof Criterion>;

export const CriteriaList = z
  .array(Criterion)
  .min(1)
  .max(20)
  .refine((list) => list.reduce((s, c) => s + c.weight, 0) === 100, uzShared.criteriaSum)
  .refine((list) => new Set(list.map((c) => c.name)).size === list.length, uzShared.criteriaDuplicate);

export const TaskInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).default(""),
    type: TaskType,
    figmaUrl: z.url().max(2000).nullish(),
    expectedOutput: z.string().max(20_000).nullish(),
  })
  .refine((t) => t.type !== "FIGMA" || (t.figmaUrl != null && /^https:\/\/([a-z0-9-]+\.)?figma\.com\//i.test(t.figmaUrl)), {
    message: uzShared.figmaUrlRequired,
    path: ["figmaUrl"],
  });
export type TaskInput = z.infer<typeof TaskInput>;

// ---------- REST kirishlari ----------

export const ExamInput = z.object({
  title: z.string().trim().min(1).max(200),
  durationMin: z.number().int().min(1).max(600),
  template: ExamTemplate,
  starterFiles: FileList.default([]),
  referenceFiles: FileList.default([]),
  criteria: CriteriaList,
  aiEnabled: z.boolean().default(true),
  aiModel: AiModelTier.default("DEFAULT"),
  allowedPackages: z.array(z.string().trim().min(1).max(214)).max(200).default([...DEFAULT_ALLOWED_PACKAGES]),
  tasks: z.array(TaskInput).min(1).max(50),
});
export type ExamInput = z.infer<typeof ExamInput>;

export const LoginInput = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const TeacherCreateInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(200),
  role: TeacherRole.default("TEACHER"),
});
export type TeacherCreateInput = z.infer<typeof TeacherCreateInput>;

export const ExtendInput = z.object({
  minutes: z.number().int().min(1).max(180),
  attemptId: z.string().min(1).optional(),
});
export type ExtendInput = z.infer<typeof ExtendInput>;

export const PenaltyInput = z.object({
  points: z.number().int().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
  eventId: z.string().min(1).optional(),
});
export type PenaltyInput = z.infer<typeof PenaltyInput>;

export const CriterionGrade = z.object({
  name: z.string().trim().min(1).max(100),
  score: z.number().int().min(0).max(100),
  comment: z.string().max(5000).default(""),
});
export type CriterionGrade = z.infer<typeof CriterionGrade>;

export const GradeInput = z.object({
  /** null — o'qituvchi bahosini olib tashlash (AI bahosiga qaytish). */
  teacherScore: z.number().int().min(0).max(100).nullish(),
  teacherComment: z.string().max(10_000).nullish(),
  criteria: z.array(CriterionGrade).min(1).max(20).optional(),
});
export type GradeInput = z.infer<typeof GradeInput>;

/** O'qituvchi tahrirlagan mezon (Attempt.teacherCriteria). */
export const GradedCriterion = z.object({
  name: z.string(),
  weight: z.number().int(),
  score: z.number().int(),
  comment: z.string(),
});
export type GradedCriterion = z.infer<typeof GradedCriterion>;

// ---------- AI natijasi (8-bosqich) ----------

export const AiResult = z.object({
  totalScore: z.number().int().min(0).max(100),
  criteria: z.array(GradedCriterion),
  tasks: z.array(
    z.object({
      taskId: z.string(),
      verdict: z.enum(["TO'G'RI", "QISMAN", "NOTO'G'RI"]),
      comment: z.string(),
    }),
  ),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  injectionAttempt: z.boolean(),
});
export type AiResult = z.infer<typeof AiResult>;
