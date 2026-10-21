import { existsSync } from "node:fs";
import { z } from "zod";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const EnvSchema = z.object({
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
