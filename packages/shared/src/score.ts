import type { AttemptStatus } from "./types.js";

export interface FinalScoreInput {
  status: AttemptStatus;
  teacherScore: number | null;
  aiScore: number | null;
  penalties: readonly { points: number }[];
}

export function sumPenalties(penalties: readonly { points: number }[]): number {
  return penalties.reduce((sum, p) => sum + p.points, 0);
}

/** Yakuniy ball — loyihadagi yagona formula (CLAUDE.md, 4-bo'lim). */
export function computeFinalScore(a: FinalScoreInput): number {
  if (a.status === "ANNULLED") return 0;
  return Math.max(0, (a.teacherScore ?? a.aiScore ?? 0) - sumPenalties(a.penalties));
}
