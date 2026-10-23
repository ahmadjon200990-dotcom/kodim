// 7-faza: Realtime uchdan-uchga sinov (haqiqiy loyiha). O'qituvchi sessiyasi fayldan ($TEMP/e2e-teacher.json),
// o'qituvchi qatori va LOBBY imtihon (kod) oldindan bazada bo'lishi kerak. Ishga tushirish:
//   node supabase/scripts/e2e-realtime.mjs <examId> <kod>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const [examId, code] = process.argv.slice(2);
const URL = process.env.SUPABASE_URL ?? "https://prkrhitgkjyuwyipqimw.supabase.co";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_SrliT3-Dc98IWucZ1Zt_hg_5AXtIOQf";
const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok) => {
  results.push([name, ok]);
  log(ok ? "✓" : "✗", name);
};

const teacher = createClient(URL, KEY, { auth: { persistSession: false } });
const saved = JSON.parse(readFileSync(join(process.env.TEMP ?? "/tmp", "e2e-teacher.json"), "utf8"));
await teacher.auth.setSession(saved);
await teacher.realtime.setAuth();
const tMsgs = [];
const tStatus = await new Promise((resolve) => {
  teacher
    .channel(`exam:${examId}`, { config: { private: true } })
    .on("broadcast", { event: "*" }, (m) => {
      tMsgs.push(m);
      log("o'qituvchi ←", m.event, m.event === "event:new" ? m.payload.event.type : m.event === "attempt:update" ? m.payload.attempt?.status : "");
    })
    .subscribe((s, err) => (s === "SUBSCRIBED" || s === "CHANNEL_ERROR") && resolve(err ? `${s} ${err.message}` : s));
});
check("o'qituvchi exam kanaliga obuna", tStatus === "SUBSCRIBED");

const student = createClient(URL, KEY, { auth: { persistSession: false } });
await student.auth.signInAnonymously();
const { data: joined } = await student.rpc("student_join", { p_code: code, p_name: "TEST Realtime O'quvchi", p_device_id: "fake-device-rt-01" });
check("o'quvchi kirdi", joined?.ok === true);
const attemptId = joined.attemptId;
await student.realtime.setAuth();
const sMsgs = [];
const sub = (topic) =>
  new Promise((resolve) => {
    student
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "*" }, (m) => {
        sMsgs.push({ topic, at: Date.now(), ...m });
        log("o'quvchi ←", topic.split(":")[0], m.event);
      })
      .subscribe((s, err) => (s === "SUBSCRIBED" || s === "CHANNEL_ERROR") && resolve(err ? `${s} ${err.message}` : s));
  });
check("o'quvchi attempt kanaliga", (await sub(`attempt:${attemptId}`)) === "SUBSCRIBED");
check("o'quvchi exam:students kanaliga", (await sub(`exam:${examId}:students`)) === "SUBSCRIBED");
const forbidden = await new Promise((resolve) => {
  student.channel(`exam:${examId}`, { config: { private: true } }).subscribe((s) => (s === "SUBSCRIBED" || s === "CHANNEL_ERROR") && resolve(s));
});
check("o'quvchi o'qituvchi kanaliga kira olmaydi", forbidden === "CHANNEL_ERROR");

await wait(1500);
const tStart = Date.now();
const { error: startErr } = await teacher.rpc("start_exam", { p_exam_id: examId });
check("o'qituvchi start_exam (JWT bilan)", !startErr);
for (let i = 0; i < 40 && !sMsgs.some((m) => m.event === "nudge"); i++) await wait(250);
const nudge = sMsgs.find((m) => m.event === "nudge");
check("o'qituvchiga exam:update RUNNING", tMsgs.some((m) => m.event === "exam:update" && m.payload.exam.status === "RUNNING"));
check("o'qituvchiga attempt:update WORKING", tMsgs.some((m) => m.event === "attempt:update" && m.payload.attempt.status === "WORKING"));
log("start → o'quvchi nudge kechikishi:", nudge ? `${nudge.at - tStart} ms` : "—");
check("nudge 10 s ichida (aks holda heartbeat 5 s zaxira)", Boolean(nudge) && nudge.at - tStart < 10_000);

await student.rpc("report_event", { p_attempt_id: attemptId, p_type: "SCREENSHOT_ATTEMPT", p_details: { key: "PrintScreen" } });
await teacher.rpc("extend_exam", { p_exam_id: examId, p_minutes: 5, p_attempt_id: attemptId });
await teacher.rpc("add_penalty", { p_attempt_id: attemptId, p_points: 5, p_reason: "TEST" });
await wait(3000);
const ev = tMsgs.find((m) => m.event === "event:new");
check("o'qituvchiga event:new (ismi, daraja WARN)", ev?.payload.studentName === "TEST Realtime O'quvchi" && ev?.payload.event.severity === "WARN");
check("vaqt qo'shilganda o'quvchiga attempt nudge", sMsgs.filter((m) => m.topic.startsWith("attempt:") && m.event === "nudge").length >= 2);
check("jarimadan keyin penaltyTotal = 5", tMsgs.some((m) => m.event === "attempt:update" && m.payload.attempt.penaltyTotal === 5));
const hb = await student.rpc("heartbeat", { p_attempt_id: attemptId });
check("heartbeat: extra vaqt endsAt da", hb.data && Date.parse(hb.data.endsAt) > Date.now() + 9 * 60_000);
const { data: grades, error: gradeErr } = await student.from("attempts").select("teacher_score");
check("o'quvchi baholarni o'qiy olmaydi", (grades ?? []).length === 0 || Boolean(gradeErr));

const failed = results.filter(([, ok]) => !ok);
log(failed.length ? `XATO: ${failed.length}/${results.length}` : `HAMMASI O'TDI: ${results.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
