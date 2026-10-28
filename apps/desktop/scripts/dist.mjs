
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "../../../packages/shared/src/brand.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const platforms = ["win", "mac", "linux"];

const platform = platforms.includes(args[0]) ? args[0] : "win";
const serverUrl =
  (platforms.includes(args[0]) ? args[1] : args[0]) ??
  process.env.SUPABASE_URL ??
  "https://prkrhitgkjyuwyipqimw.supabase.co";

const bin = (name) =>
  join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.CMD` : name,
  );

const run = (cmd, commandArgs, env = {}) =>
  execFileSync(cmd, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });

if (platform === "mac" && process.platform !== "darwin") {
  throw new Error("macOS build uchun macOS kompyuteri kerak.");
}

console.log(`Platform: ${platform}`);
console.log(`Server: ${serverUrl}`);

run(bin("electron-vite"), ["build"], {
  SUPABASE_URL: serverUrl,
  NODE_ENV: "production",
});

run(
  bin("electron-builder"),
  [
    `--${platform}`,
    "--config",
    "electron-builder.config.mjs",
    "--publish",
    "never",
  ],
);

if (platform === "win") {
  const { version } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );

  const file = `${BRAND.name}-Setup-${version}.exe`;
  const path = join(root, "release", file);

  const latest = {
    version,
    file,
    url: `/downloads/${file}`,
    size: statSync(path).size,
    sha256: createHash("sha256")
      .update(readFileSync(path))
      .digest("hex"),
    date: new Date().toISOString(),
    server: serverUrl,
  };

  mkdirSync(join(root, "release"), { recursive: true });

  writeFileSync(
    join(root, "release", "latest.json"),
    `${JSON.stringify(latest, null, 2)}\n`,
  );

  console.log("release/latest.json:", latest);
}
