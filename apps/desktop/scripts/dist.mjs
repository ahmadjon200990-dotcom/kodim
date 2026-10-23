// Windows .exe build: electron-vite build (SUPABASE_URL bilan) → electron-builder (NSIS) → release/latest.json.
//   node scripts/dist.mjs [server-url]     standart: https://teacher.kodim.uz
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "../../../packages/shared/src/brand.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverUrl = process.argv[2] ?? process.env.SUPABASE_URL ?? "https://prkrhitgkjyuwyipqimw.supabase.co";
const bin = (name) => join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.CMD` : name);
const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });

console.log(`Server: ${serverUrl}`);
run(bin("electron-vite"), ["build"], { SUPABASE_URL: serverUrl, NODE_ENV: "production" });
run(bin("electron-builder"), ["--win", "--config", "electron-builder.config.mjs", "--publish", "never"]);

// Landing "Yuklab olish" tugmasi uchun versiya fayli.
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const file = `${BRAND.name}-Setup-${version}.exe`;
const path = join(root, "release", file);
const latest = {
  version,
  file,
  url: `/downloads/${file}`,
  size: statSync(path).size,
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  date: new Date().toISOString(),
  server: serverUrl,
};
writeFileSync(join(root, "release", "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
console.log("release/latest.json:", latest);
