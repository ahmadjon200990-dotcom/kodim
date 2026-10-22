import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

// Ommaviy internet uchun xavfsiz HTTP sarlavhalari (helmet o'rniga — qo'shimcha paketsiz).

/** Panel uchun CSP: Monaco worker'lari blob:, rasmlar data:/blob:, socket — o'z domeni (wss). */
const PANEL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export function registerSecurityHeaders(app: FastifyInstance): void {
  const https = env.PUBLIC_URL.startsWith("https://");
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "strict-origin-when-cross-origin");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    reply.header("cross-origin-opener-policy", "same-origin");
    if (https) reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    const type = String(reply.getHeader("content-type") ?? "");
    if (type.startsWith("text/html")) reply.header("content-security-policy", PANEL_CSP);
    if (req.url.startsWith("/api/")) reply.header("cache-control", reply.getHeader("cache-control") ?? "no-store");
    return payload;
  });
}

/** CORS: faqat ruxsat etilgan manbalar (panel domeni + dev). Desktop ilova socket'i Node'dan — Origin yo'q. */
export function allowedOrigins(): string[] {
  const list = new Set<string>();
  if (env.PUBLIC_URL) list.add(new URL(env.PUBLIC_URL).origin);
  for (const o of env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)) list.add(o);
  if (env.NODE_ENV !== "production") {
    list.add("http://localhost:5273");
    list.add("http://localhost:8080");
    list.add("http://127.0.0.1:8080");
  }
  return [...list];
}

export function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow: boolean) => void): void {
  if (!origin) return cb(null, true);
  cb(null, allowedOrigins().includes(origin));
}
