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
});

export const env = EnvSchema.parse(process.env);
