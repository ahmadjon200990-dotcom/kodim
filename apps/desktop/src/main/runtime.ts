import { exec } from "node:child_process";
import type { RuntimeInfo } from "../common/api";

// Kompyuterda dasturlash muhitlari bor-yo'qligini bir marta tekshiradi (Status Bar uchun).

function has(cmd: string): Promise<boolean> {
  const probe = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
  return new Promise((resolve) => {
    exec(probe, { windowsHide: true, timeout: 4000 }, (err, stdout) => resolve(!err && stdout.trim().length > 0));
  });
}

let cached: RuntimeInfo | null = null;

export async function detectRuntime(): Promise<RuntimeInfo> {
  if (cached) return cached;
  const [node, npm, python] = await Promise.all([has("node"), has("npm"), has("python").then((p) => p || has("python3"))]);
  cached = { node, npm, python };
  return cached;
}
