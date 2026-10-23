// Sinov uchun soxta o'quvchi (eski apps/server/src/dev/fake-student.ts o'rniga) — desktop bilan bir xil RPC'lar.
// Ishga tushirish: node supabase/scripts/fake-student.mjs <kod> "<TEST Ism>" [deviceId]
// stdin: `event TYPE` (masalan FOCUS_LOST), `sync` (index.html yuborish), `submit`, `close` (APP_CLOSED), `quit`.
// Muhit: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (standart — loyiha "kodim"). Ismlar "TEST " bilan boshlansin (tozalash skripti).
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const [code, name, deviceId = `fake-${Math.random().toString(36).slice(2, 10)}`] = process.argv.slice(2);
if (!code || !name) {
  console.error('Foydalanish: node supabase/scripts/fake-student.mjs <kod> "<TEST Ism>" [deviceId]');
  process.exit(1);
}
const sb = createClient(
  process.env.SUPABASE_URL ?? "https://prkrhitgkjyuwyipqimw.supabase.co",
  process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_SrliT3-Dc98IWucZ1Zt_hg_5AXtIOQf",
  { auth: { persistSession: false } },
);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

const { data: signed, error: signError } = await sb.auth.signInAnonymously();
if (signError) throw signError;
log("anonim uid", signed.user.id);
const joined = await rpc("student_join", { p_code: code, p_name: name, p_device_id: deviceId });
if (!joined.ok) {
  log("KIRISH RAD ETILDI", joined);
  process.exit(2);
}
const attemptId = joined.attemptId;
log("kirdi", { attemptId, exam: joined.exam.title, phase: joined.state.phase, files: joined.state.files?.map((f) => f.path) });

let phase = joined.state.phase;
const timer = setInterval(async () => {
  try {
    const s = await rpc("heartbeat", { p_attempt_id: attemptId });
    if (s.phase !== phase) {
      log("holat", phase, "→", s.phase, { endsAt: s.endsAt, ending: s.ending });
      if (s.phase === "WORKING") {
        const full = await rpc("student_state", { p_attempt_id: attemptId, p_with_files: true });
        log("fayllar", full.files?.map((f) => f.path));
      }
      phase = s.phase;
    }
    if (s.ending) log("topshirish jarayoni (15 s)");
  } catch (e) {
    log("heartbeat xato", e.message);
  }
}, 5000);

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const [cmd, arg] = line.trim().split(/\s+/);
  try {
    if (cmd === "event") log("event", await rpc("report_event", { p_attempt_id: attemptId, p_type: arg ?? "FOCUS_LOST", p_details: { fake: true } }));
    else if (cmd === "sync") log("sync", await rpc("sync_files", { p_attempt_id: attemptId, p_files: [{ path: "index.html", content: `<p>${Date.now()}</p>` }], p_deleted: [] }));
    else if (cmd === "submit") log("submit", await rpc("submit_attempt", { p_attempt_id: attemptId }));
    else if (cmd === "close") {
      await rpc("report_app_closed", { p_attempt_id: attemptId });
      log("APP_CLOSED");
      process.exit(0);
    } else if (cmd === "quit") process.exit(0);
  } catch (e) {
    log("xato", e.message);
  }
});
process.on("exit", () => clearInterval(timer));
