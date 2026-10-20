import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { ApiError } from "./api";

export type LoadState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "notFound"; data: null; error: string }
  | { status: "error"; data: null; error: string };

/**
 * Sahifa ma'lumotini yuklash: yuklanish, tayyor, topilmadi (404) yoki xato — abadiy "Yuklanmoqda…" bo'lmaydi.
 * 401 bo'lsa api.ts o'zi login sahifasiga qaytaradi.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading", data: null, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async (silent = false) => {
    const my = ++seq.current;
    if (!silent) setState({ status: "loading", data: null, error: null });
    try {
      const data = await fnRef.current();
      if (my === seq.current) setState({ status: "ready", data, error: null });
    } catch (e) {
      if (my !== seq.current) return;
      const message = e instanceof Error ? e.message : String(e);
      const notFound = e instanceof ApiError && (e.status === 404 || e.status === 400);
      // Jim yangilashda xato bo'lsa — eski ma'lumot qoladi.
      if (silent) return;
      setState({ status: notFound ? "notFound" : "error", data: null, error: message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, deps);

  return { ...state, reload };
}
