// Statik landing sahifa (kodim.uz): src/ shablonlari + brand.ts + yagona tokenlar → dist/.
//   PANEL_URL=https://teacher.kodim.uz node build.mjs
// Yuklab olish tugmasi /downloads/latest.json ni o'qiydi (desktop: apps/desktop/release/latest.json, DEPLOY.md).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "../../packages/shared/src/brand.ts";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const domain = process.env.LANDING_DOMAIN ?? BRAND.domain;
const panelUrl = process.env.PANEL_URL ?? `https://teacher.${domain}`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "img"), { recursive: true });

const vars = { NAME: BRAND.name, PANEL_NAME: BRAND.panelName, SLOGAN: BRAND.slogan, DOMAIN: domain, PANEL_URL: panelUrl, YEAR: String(new Date().getFullYear()) };
const fill = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

writeFileSync(join(dist, "index.html"), fill(readFileSync(join(root, "src/index.html"), "utf8")));
writeFileSync(join(dist, "styles.css"), readFileSync(join(root, "../../packages/shared/design/tokens.css"), "utf8") + "\n" + readFileSync(join(root, "src/styles.css"), "utf8"));
cpSync(join(root, "src/app.js"), join(dist, "app.js"));
cpSync(join(root, "public"), dist, { recursive: true });

// Skrinshotlar — docs/screenshots/after dan (bo'lsa).
const shots = join(root, "../../docs/screenshots/after");
for (const f of ["desktop-workspace.png", "desktop-design-inspect.png", "panel-live.png", "panel-submissions.png"]) {
  if (existsSync(join(shots, f))) cpSync(join(shots, f), join(dist, "img", f));
}
console.log(`landing: ${dist} (panel: ${panelUrl})`);
