import { existsSync } from "node:fs";
import { z } from "zod";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  /** Panel va API'ning ommaviy manzili (Google OAuth qaytish manzili shundan): https://teacher.kodim.uz */
  PUBLIC_URL: z.string().default("http://localhost:8080"),
  /** Qo'shimcha CORS manbalari (vergul bilan). */
  CORS_ORIGINS: z.string().default(""),
  /** Server Caddy/Nginx ortida: X-Forwarded-For dan IP olinadi. */
  TRUST_PROXY: z
    .string()
    .default("")
    .transform((v) => v === "1" || v.toLowerCase() === "true"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().default(""),
  AI_MODEL_DEFAULT: z.string().default("claude-haiku-5-5"),
  AI_MODEL_STRONG: z.string().default("claude-sonnet-5-5"),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default("0.0.0.0"),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  /** Bazadagi maxfiy qiymatlarni (Figma token) shifrlash kaliti. Bo'lmasa JWT_SECRET dan hosil qilinadi. */
  DATA_ENCRYPTION_KEY: z.string().default(""),
  /** Figma REST API manzili (sinov uchun soxta server: src/dev/fake-figma.ts). */
  FIGMA_API_BASE: z.string().default("https://api.figma.com"),
});

export const env = EnvSchema.parse(process.env);

// Production'da zaif maxfiy kalit bilan ishga tushmaslik.
if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET.length < 32 || /change-me/i.test(env.JWT_SECRET)) {
    throw new Error("JWT_SECRET kamida 32 belgili tasodifiy qiymat bo'lishi kerak (openssl rand -base64 48)");
  }
  if (!env.PUBLIC_URL.startsWith("https://")) console.warn("[ogohlantirish] PUBLIC_URL https:// bilan boshlanmayapti");
}

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
