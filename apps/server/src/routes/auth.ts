import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { LoginInput } from "@exam-ide/shared";
import { prisma } from "../db.js";
import { env, googleEnabled } from "../env.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { googleByIp, loginByIp, loginFailByEmail } from "../lib/rateLimit.js";
import { uz } from "../uz.js";

// O'qituvchi kirishi: email+parol (seed admin — favqulodda holat uchun) va Google OAuth (CLAUDE.md 0.8.4).
// Google: birinchi kirish TEACHER akkaunt yaratadi; email tasdiqlangan bo'lishi shart; o'chirilgan akkaunt kira olmaydi.

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_COOKIE = "kodim_oauth_state";

const publicBase = () => env.PUBLIC_URL.replace(/\/$/, "");
const redirectUri = () => `${publicBase()}/api/auth/google/callback`;

function limited(reply: FastifyReply, retryAfter: number): never {
  reply.header("retry-after", String(retryAfter));
  throw new HttpError(429, uz.tooManyAttempts(Math.max(1, Math.ceil(retryAfter / 60))));
}

/** Panelga qaytish: token URL fragmentida (server loglariga va Referer'ga tushmaydi). */
function backToPanel(reply: FastifyReply, params: Record<string, string>) {
  return reply.redirect(`${publicBase()}/auth/callback#${new URLSearchParams(params).toString()}`);
}

function readCookie(req: FastifyRequest, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

const GoogleUser = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  const sign = (id: string) => app.jwt.sign({ sub: id });

  app.get("/api/auth/config", async () => ({ google: googleEnabled }));

  app.post("/api/auth/login", async (req, reply) => {
    const ip = loginByIp.hit(req.ip);
    if (!ip.ok) limited(reply, ip.retryAfter);
    const input = LoginInput.parse(req.body);
    const emailBlock = loginFailByEmail.blocked(input.email);
    if (emailBlock) limited(reply, emailBlock);
    const teacher = await prisma.teacher.findUnique({ where: { email: input.email } });
    // Google orqali yaratilgan akkauntda parol yo'q (bo'sh xesh) — parol bilan kirib bo'lmaydi.
    const valid = teacher?.passwordHash ? await bcrypt.compare(input.password, teacher.passwordHash) : false;
    if (!teacher || !valid) {
      loginFailByEmail.hit(input.email);
      req.log.warn({ email: input.email, ip: req.ip }, "login: noto'g'ri email yoki parol");
      throw new HttpError(401, uz.loginFailed);
    }
    if (teacher.disabled) throw new HttpError(403, uz.accountDisabled);
    loginFailByEmail.reset(input.email);
    await prisma.teacher.update({ where: { id: teacher.id }, data: { lastLoginAt: new Date() } });
    return {
      token: await sign(teacher.id),
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role },
    };
  });

  // ---- Google OAuth (Authorization Code oqimi, state cookie bilan CSRF himoyasi)
  app.get("/api/auth/google", async (req, reply) => {
    if (!googleEnabled) throw new HttpError(404, uz.googleDisabled);
    const ip = googleByIp.hit(req.ip);
    if (!ip.ok) limited(reply, ip.retryAfter);
    const state = randomBytes(24).toString("base64url");
    const secure = env.PUBLIC_URL.startsWith("https://") ? "; Secure" : "";
    reply.header("set-cookie", `${STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${secure}`);
    const url = new URL(GOOGLE_AUTH);
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    return reply.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req, reply) => {
    if (!googleEnabled) return backToPanel(reply, { error: "google_disabled" });
    if (!googleByIp.hit(req.ip).ok) return backToPanel(reply, { error: "rate_limited" });
    const q = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(req.query);
    reply.header("set-cookie", `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0`);
    if (q.error || !q.code) return backToPanel(reply, { error: "cancelled" });
    const expected = readCookie(req, STATE_COOKIE);
    if (!expected || expected !== q.state) return backToPanel(reply, { error: "state" });

    let profile: z.infer<typeof GoogleUser>;
    try {
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: q.code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri(),
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokens = (await tokenRes.json()) as { access_token?: string };
      if (!tokenRes.ok || !tokens.access_token) throw new Error("token");
      const infoRes = await fetch(GOOGLE_USERINFO, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      profile = GoogleUser.parse(await infoRes.json());
    } catch (err) {
      req.log.warn({ err }, "google: token/userinfo xatosi");
      return backToPanel(reply, { error: "google" });
    }
    if (!profile.email_verified) return backToPanel(reply, { error: "unverified" });

    const email = profile.email.toLowerCase();
    // 1) shu Google akkaunti, 2) shu email bilan mavjud akkaunt (birinchi Google kirishida bog'lanadi), 3) yangi TEACHER.
    let teacher =
      (await prisma.teacher.findUnique({ where: { googleId: profile.sub } })) ??
      (await prisma.teacher.findUnique({ where: { email } }));
    if (teacher?.disabled) return backToPanel(reply, { error: "disabled" });
    if (teacher) {
      teacher = await prisma.teacher.update({
        where: { id: teacher.id },
        data: { googleId: profile.sub, lastLoginAt: new Date() },
      });
    } else {
      teacher = await prisma.teacher.create({
        data: {
          email,
          name: (profile.name ?? email.split("@")[0] ?? "O'qituvchi").slice(0, 100),
          googleId: profile.sub,
          passwordHash: "",
          role: "TEACHER",
          lastLoginAt: new Date(),
        },
      });
      req.log.info({ teacherId: teacher.id, email }, "google: yangi o'qituvchi");
    }
    return backToPanel(reply, { token: await sign(teacher.id) });
  });

  app.get("/api/me", { preHandler: requireAuth }, async (req) => req.teacher);
}
