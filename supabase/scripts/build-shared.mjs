// packages/shared modullari → supabase/functions/_shared/*.js (har biri bitta ESM fayl, bog'liqliklari ichida).
// Deno monorepo importlarini (`./x.js` → `.ts`) hal qilmaydi, shuning uchun bundle (MIGRATION-PLAN.md 6-bo'lim, 1-faza qarori).
// Faqat Edge Function'larga kerakli modullar — butun index (zod bilan ~770 KB) emas.
// Ishga tushirish: node supabase/scripts/build-shared.mjs   (Edge Function deploy'dan oldin)
import { build } from "esbuild";

const MODULES = ["figma", "score"];

await build({
  entryPoints: MODULES.map((m) => ({ in: `packages/shared/src/${m}.ts`, out: m })),
  outdir: "supabase/functions/_shared",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  legalComments: "none",
  banner: { js: "// GENERATSIYA QILINGAN — supabase/scripts/build-shared.mjs. Qo'lda tahrirlamang.\n// @ts-nocheck" },
  logLevel: "info",
});
