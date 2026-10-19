// Server javoblari uchun panel tomonidagi tiplar (shared tiplarni to'ldiradi).
import type { AttemptStatus, ExamStatus, ExamTemplate, GradedBy, TaskType, TeacherRole } from "@exam-ide/shared";

export interface Teacher {
  id: string;
  name: string;
  email: string;
  role: TeacherRole;
  createdAt?: string;
}

export interface ExamListItem {
  id: string;
  title: string;
  status: ExamStatus;
  code: string | null;
  durationMin: number;
  startedAt: string | null;
  endsAt: string | null;
  createdAt: string;
  teacher: { id: string; name: string };
  _count: { attempts: number; tasks: number };
}

export interface TaskDto {
  id: string;
  order: number;
  title: string;
  description: string;
  type: TaskType;
  figmaUrl: string | null;
  expectedOutput: string | null;
}

export interface ExamFull {
  id: string;
  title: string;
  status: ExamStatus;
  code: string | null;
  durationMin: number;
  startedAt: string | null;
  endsAt: string | null;
  template: ExamTemplate;
  starterFiles: { path: string; content: string }[];
  referenceFiles: { path: string; content: string }[];
  criteria: { name: string; weight: number; description: string }[];
  aiEnabled: boolean;
  aiModel: "DEFAULT" | "STRONG";
  allowedPackages: string[];
  tasks: TaskDto[];
}

export interface PenaltyDto {
  id: string;
  points: number;
  reason: string;
  eventId: string | null;
  createdAt: string;
  teacher?: { id: string; name: string };
}

export interface EventRow {
  id: string;
  attemptId: string;
  type: string;
  severity: "INFO" | "WARN" | "DANGER";
  details: unknown;
  createdAt: string;
}

export interface AttemptDetail {
  id: string;
  examId: string;
  studentName: string;
  status: AttemptStatus;
  connected: boolean;
  extraMinutes: number;
  submittedAt: string | null;
  deviceId: string | null;
  files: { path: string; content: string }[];
  aiScore: number | null;
  aiResult: unknown;
  aiError: string | null;
  teacherScore: number | null;
  teacherComment: string | null;
  teacherCriteria: { name: string; weight: number; score: number; comment: string }[] | null;
  gradedBy: GradedBy;
  events: EventRow[];
  penalties: PenaltyDto[];
  penaltyTotal: number;
  finalScore: number;
}
