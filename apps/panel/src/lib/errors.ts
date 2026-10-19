// Server qaytargan validatsiya xatolarini (zod issues) maydon nomlari bilan o'zbekcha ro'yxatga aylantiradi.
import { ApiError } from "./api";

interface Issue {
  path?: (string | number)[];
  message?: string;
}

const FIELD: Record<string, string> = {
  title: "Imtihon nomi",
  durationMin: "Vaqt",
  template: "Boshlang'ich papka",
  criteria: "Mezonlar",
  tasks: "Topshiriqlar",
  referenceFiles: "Namuna yechim",
  starterFiles: "Boshlang'ich fayllar",
  allowedPackages: "Ruxsat etilgan paketlar",
  aiModel: "AI modeli",
  name: "Ism",
  email: "Email",
  password: "Parol",
  role: "Rol",
  points: "Ball",
  reason: "Sabab",
  minutes: "Daqiqa",
  teacherScore: "O'qituvchi bahosi",
};

const SUB: Record<string, string> = {
  title: "nomi",
  description: "sharti",
  figmaUrl: "Figma havolasi",
  expectedOutput: "kutilgan natija",
  name: "nomi",
  weight: "foizi",
  path: "fayl yo'li",
  content: "tarkibi",
  score: "ball",
  comment: "izoh",
};

const GROUP_ITEM: Record<string, string> = {
  tasks: "topshiriq",
  criteria: "mezon",
  referenceFiles: "namuna fayl",
  starterFiles: "boshlang'ich fayl",
  allowedPackages: "paket",
};

function label(path: (string | number)[]): string {
  const [head, index, sub] = path;
  if (typeof head !== "string") return "";
  if (typeof index === "number") {
    const item = GROUP_ITEM[head] ?? FIELD[head] ?? head;
    const subLabel = typeof sub === "string" ? `, ${SUB[sub] ?? sub}` : "";
    return `${index + 1}-${item}${subLabel}`;
  }
  return FIELD[head] ?? head;
}

/** Xatoni foydalanuvchiga ko'rsatiladigan qatorlar ro'yxatiga aylantiradi. */
export function errorLines(err: unknown, fallback: string): string[] {
  if (!(err instanceof ApiError)) return [fallback];
  const issues = Array.isArray(err.issues) ? (err.issues as Issue[]) : [];
  if (issues.length === 0) return [err.message];
  const lines = issues.map((i) => {
    const where = label(i.path ?? []);
    return where ? `${where}: ${i.message ?? ""}` : (i.message ?? "");
  });
  return [...new Set(lines)];
}
