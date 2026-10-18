import type { FastifyBaseLogger } from "fastify";
import { ZodError } from "zod";
import type { Ack } from "@exam-ide/shared";
import { HttpError } from "../lib/http.js";
import { uz } from "../uz.js";

/** Socket handlerini bajaradi va natijani ack orqali qaytaradi (xatolar o'zbekcha xabar bilan). */
export async function respond<T extends object>(log: FastifyBaseLogger, ack: unknown, fn: () => Promise<T>) {
  const reply: Ack<T> = typeof ack === "function" ? (ack as Ack<T>) : () => {};
  try {
    reply({ ok: true, ...(await fn()) });
  } catch (err) {
    if (err instanceof HttpError) return reply({ ok: false, error: err.message });
    if (err instanceof ZodError) return reply({ ok: false, error: uz.validation });
    log.error(err);
    reply({ ok: false, error: uz.internal });
  }
}

const chains = new Map<string, Promise<unknown>>();

/** Bir kalit uchun ishlarni ketma-ket bajaradi (masalan bitta attempt'ning sync'lari). */
export function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.catch(() => undefined);
  chains.set(key, settled);
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return next;
}
