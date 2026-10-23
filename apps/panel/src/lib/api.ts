// Panel ma'lumot qatlami. Sahifalar eski REST yo'llari bilan chaqiradi (`api.get("/exams")`) — ular Supabase'ga
// lib/backend.ts da o'giriladi (RLS, view'lar, RPC'lar). Sessiya — supabase-js (lib/supabase.ts).
import { ApiError, forceLogout, route, setUnauthorizedHandler } from "./backend";

export { ApiError, forceLogout, setUnauthorizedHandler };

/** Vaqtinchalik: eski socket (7-faza) va Figma rasm (9-faza) kodi uchun — shu fazalarda olib tashlanadi. */
export const tokenStore = { get: (): string | null => null };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return (await route(method, path, body)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** Brauzerda yaratilgan faylni yuklab berish. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** .zip yuklab olish: `/exams/:id/download.zip` (hamma ishlar) yoki `/attempts/:id/download.zip` (bitta o'quvchi). */
export async function downloadFile(path: string, fallback: string): Promise<void> {
  const { attemptZip, examZip } = await import("./exports");
  const exam = /^\/exams\/([^/]+)\/download\.zip$/.exec(path)?.[1];
  const attempt = /^\/attempts\/([^/]+)\/download\.zip$/.exec(path)?.[1];
  const file = exam ? await examZip(exam) : attempt ? await attemptZip(attempt) : null;
  if (!file) throw new ApiError(404, fallback);
  saveBlob(file.blob, `${file.name}.zip`);
}

export async function downloadExport(examId: string, filename: string): Promise<void> {
  const { resultsWorkbook } = await import("./exports");
  saveBlob(await resultsWorkbook(examId), filename);
}
