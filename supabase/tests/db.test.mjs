// Supabase migratsiyalari va RLS testlari — lokal Postgres (PGlite, WASM) ichida, Supabase muhiti prelude.sql bilan.
// Ishga tushirish: pnpm test:db   (haqiqiy loyihada *.test.sql fayllarni MCP execute_sql bilan ham bajarish mumkin —
// ular ROLLBACK bilan tugaydi).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { computeFinalScore } from "../../packages/shared/src/score.ts";
import { EVENT_SEVERITY, SERVER_ONLY_EVENT_TYPES } from "../../packages/shared/src/events.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");
// Faqat lokal muhitda ishlamaydigan kengaytmalar (pg_cron, realtime) talab qiladigan migratsiyalar `-- @remote-only` bilan belgilanadi.
const migrations = readdirSync(join(root, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: read("migrations", f) }))
  .filter((m) => !m.sql.startsWith("-- @remote-only"));

async function freshDb() {
  const db = new PGlite();
  await db.exec(read("tests", "prelude.sql"));
  for (const m of migrations) {
    try {
      await db.exec(m.sql);
    } catch (e) {
      throw new Error(`${m.name}: ${e.message}`);
    }
  }
  return db;
}

describe("migratsiyalar", () => {
  for (const file of readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.sql")).sort()) {
    it(file, async () => {
      const db = await freshDb();
      try {
        await db.exec(read("tests", file));
      } catch (e) {
        throw new Error(`${e.code ?? ""} ${e.message}`);
      }
    });
  }

  it("event_types = shared/events.ts", async () => {
    const db = await freshDb();
    const { rows } = await db.query("select type, severity, client_allowed from public.event_types order by type");
    const expected = Object.entries(EVENT_SEVERITY)
      .map(([type, severity]) => ({ type, severity, client_allowed: !SERVER_ONLY_EVENT_TYPES.includes(type) }))
      .sort((a, b) => (a.type < b.type ? -1 : 1));
    assert.deepEqual(rows, expected);
  });

  it("cleanup-test-data.sql faqat belgili ma'lumotni o'chiradi", async () => {
    const db = await freshDb();
    await db.exec(`
      insert into auth.users (id, email, is_anonymous) values
        ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
        ('00000000-0000-4000-a000-00000000000b', 'real@kodim.uz', false),
        ('00000000-0000-4000-a000-0000000000e1', null, true),
        ('00000000-0000-4000-a000-0000000000e2', null, true);
      insert into public.teachers (id, name, email) values
        ('00000000-0000-4000-a000-00000000000a', 'TEST', 'a@test.kodim.uz'),
        ('00000000-0000-4000-a000-00000000000b', 'Real', 'real@kodim.uz');
      insert into public.exams (id, teacher_id, title, duration_min) values
        ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', 'Oddiy nom', 10),
        ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'Haqiqiy imtihon', 10),
        ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-a000-00000000000b', '[TEST] real o''qituvchida', 10);
      insert into public.attempts (exam_id, student_uid, student_name) values
        ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000e1', 'TEST Ali'),
        ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000e2', 'Vali Haqiqiy');`);
    await db.exec(read("scripts", "cleanup-test-data.sql").replace(/rollback;\s*$/, "commit;"));
    const q = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r)[0]);
    assert.deepEqual(await q("select email from public.teachers"), ["real@kodim.uz"]);
    assert.deepEqual(await q("select title from public.exams"), ["Haqiqiy imtihon"]);
    assert.deepEqual(await q("select student_name from public.attempts"), ["Vali Haqiqiy"]);
    assert.deepEqual((await q("select id from auth.users order by id")).length, 2);
  });

  it("final_score = computeFinalScore", async () => {
    const db = await freshDb();
    await db.exec(`
      insert into auth.users (id) values ('00000000-0000-4000-a000-00000000000a'), ('00000000-0000-4000-a000-0000000000e1');
      insert into public.teachers (id, name, email) values ('00000000-0000-4000-a000-00000000000a', 'TEST', 'a@test.kodim.uz');
      insert into public.exams (id, teacher_id, title, duration_min) values
        ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', '[TEST]', 10);`);
    const scores = [null, 0, 40, 100];
    const statuses = ["WORKING", "SUBMITTED", "ANNULLED"];
    const penaltySets = [[], [5], [10, 50], [100, 30]];
    let n = 0;
    for (const status of statuses)
      for (const teacherScore of scores)
        for (const aiScore of scores)
          for (const penalties of penaltySets) {
            n++;
            const id = `00000000-0000-4000-c000-${String(n).padStart(12, "0")}`;
            await db.query(
              `insert into public.attempts (id, exam_id, student_uid, student_name, status, teacher_score, ai_score)
               values ($1, '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000e1', 'TEST', $2, $3, $4)`,
              [id, status, teacherScore, aiScore],
            );
            for (const points of penalties)
              await db.query(
                `insert into public.penalties (attempt_id, points, reason, teacher_id) values ($1, $2, 'TEST', '00000000-0000-4000-a000-00000000000a')`,
                [id, points],
              );
            const { rows } = await db.query("select public.final_score(a) as s from public.attempts a where id = $1", [id]);
            assert.equal(
              rows[0].s,
              computeFinalScore({ status, teacherScore, aiScore, penalties: penalties.map((points) => ({ points })) }),
              JSON.stringify({ status, teacherScore, aiScore, penalties }),
            );
          }
  });
});
