// REST klient. JWT localStorage'da. 401 bo'lsa chiqib ketadi.
const TOKEN_KEY = "kodim.token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

/** Token yaroqsiz (REST 401 yoki socket rad etdi) — login sahifasiga. */
export function forceLogout(): void {
  onUnauthorized();
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(token && { authorization: `Bearer ${token}` }),
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Server bilan aloqa yo'q");
  }
  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, "Avtorizatsiya kerak");
  }
  if (res.status === 204) return undefined as T;
  const data = parseJson(await res.text());
  if (!res.ok) {
    const msg = typeof data === "object" && data !== null && "error" in data ? String((data as { error: unknown }).error) : "Xatolik";
    throw new ApiError(res.status, msg, (data as { issues?: unknown })?.issues);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** Excel yuklab olish (JWT bilan). */
export async function downloadExport(examId: string, filename: string): Promise<void> {
  const res = await fetch(`/api/exams/${examId}/export.xlsx`, {
    headers: { authorization: `Bearer ${tokenStore.get() ?? ""}` },
  });
  if (!res.ok) throw new ApiError(res.status, "Yuklab bo'lmadi");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
