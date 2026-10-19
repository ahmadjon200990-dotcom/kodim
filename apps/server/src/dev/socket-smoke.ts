// Real vaqt oqimini tekshiruvchi skript: soxta o'quvchilar va o'qituvchi socket'i.
// Ishlatish: server ishlab turganda `pnpm --filter @exam-ide/server smoke` (SMOKE_URL bilan manzilni o'zgartirish mumkin).
import { io, type Socket } from "socket.io-client";
import type {
  AckResult,
  StudentClientToServer,
  StudentJoinOk,
  StudentServerToClient,
  TeacherClientToServer,
  TeacherServerToClient,
} from "@exam-ide/shared";

type StudentSocket = Socket<StudentServerToClient, StudentClientToServer>;
type TeacherSocket = Socket<TeacherServerToClient, TeacherClientToServer>;

const BASE = process.env.SMOKE_URL ?? "http://127.0.0.1:8080";
const failures: string[] = [];

function check(cond: unknown, msg: string): void {
  console.log(`${cond ? "  ok " : "  XATO"} ${msg}`);
  if (!cond) failures.push(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Keyingi `event` ni kutadi (predicate mos kelguncha). */
function waitFor<A>(socket: Socket, event: string, timeoutMs: number, predicate: (arg: A) => boolean = () => true) {
  return new Promise<A>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`"${event}" ${timeoutMs} ms ichida kelmadi`));
    }, timeoutMs);
    const handler = (arg: A) => {
      if (!predicate(arg)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(arg);
    };
    socket.on(event, handler);
  });
}

function student(): StudentSocket {
  return io(`${BASE}/student`, { transports: ["websocket"], reconnection: false });
}

function join(s: StudentSocket, code: string, name: string, deviceId: string, token?: string) {
  return new Promise<AckResult<StudentJoinOk>>((resolve) =>
    s.emit("student:join", { code, name, deviceId, ...(token && { token }) }, resolve),
  );
}

async function joinOk(s: StudentSocket, code: string, name: string, deviceId: string, token?: string): Promise<StudentJoinOk> {
  const res = await join(s, code, name, deviceId, token);
  if (!res.ok) throw new Error(`join ${name}: ${res.error}`);
  return res;
}

const examBody = (title: string, durationMin: number, aiEnabled: boolean) => ({
  title,
  durationMin,
  template: "HTML",
  aiEnabled,
  criteria: [{ name: "Umumiy", weight: 100 }],
  tasks: [
    { title: "Mashq", type: "EXERCISE", description: "Funksiya yozing" },
    { title: "Profil kartasi", type: "FIGMA", figmaUrl: "https://www.figma.com/design/abc/profile" },
  ],
});

interface ExamRow {
  id: string;
  code: string | null;
  status: string;
}
interface AttemptRow {
  id: string;
  studentName: string;
  status: string;
}
interface AttemptDetail extends AttemptRow {
  files: { path: string; content: string }[];
  events: { type: string; severity: string }[];
}

async function createOpenExam(token: string, title: string, durationMin: number, aiEnabled: boolean) {
  const exam = await api<ExamRow>("POST", "/exams", token, examBody(title, durationMin, aiEnabled));
  const opened = await api<ExamRow>("POST", `/exams/${exam.id}/open`, token);
  return { id: exam.id, code: opened.code ?? "" };
}

async function mainFlow(token: string, teacher: TeacherSocket) {
  console.log("\n== Asosiy oqim: 2 o'quvchi, join → start → sync → finish → SUBMITTED");
  const exam = await createOpenExam(token, "Smoke: asosiy", 30, true);
  check(/^\d{6}$/.test(exam.code), `6 xonali kod: ${exam.code}`);
  const watch = await teacher.emitWithAck("exam:watch", { examId: exam.id });
  check(watch.ok, "o'qituvchi exam:watch");

  const s1 = student();
  const s2 = student();
  const bad = await join(s1, "000000", "Ali Valiyev", "device-ali-1");
  check(!bad.ok, `noto'g'ri kod rad etildi (${bad.ok ? "" : bad.error})`);

  const lobbyTwo = waitFor<{ attempts: unknown[] }>(teacher, "lobby:update", 5000, (p) => p.attempts.length === 2);
  const countTwo = waitFor<{ joinedCount: number }>(s1, "lobby:count", 5000, (p) => p.joinedCount === 2);
  const j1 = await joinOk(s1, exam.code, "Ali Valiyev", "device-ali-1");
  const j2 = await joinOk(s2, exam.code, "Vali Aliyev", "device-vali-1");
  check(j1.state.phase === "LOBBY" && j2.state.phase === "LOBBY", "ikkala o'quvchi kutish xonasida");
  await lobbyTwo;
  check(true, "o'qituvchiga lobby:update (2 o'quvchi)");
  await countTwo;
  check(true, "o'quvchiga lobby:count = 2");

  const dup = student();
  const dupRes = await join(dup, exam.code, "  ali   valiyev ", "device-dup-1");
  check(!dupRes.ok, "band ism bilan ikkinchi kirish rad etildi");
  dup.disconnect();

  const started1 = waitFor<{ files: { path: string }[]; endsAt: string }>(s1, "exam:started", 5000);
  const started2 = waitFor<{ files: { path: string }[] }>(s2, "exam:started", 5000);
  await api("POST", `/exams/${exam.id}/start`, token);
  const st1 = await started1;
  await started2;
  const paths = st1.files.map((f) => f.path);
  check(paths.includes("savollar.md") && paths.includes("index.html"), `exam:started fayllari: ${paths.join(", ")}`);
  check(paths.some((p) => p.startsWith("dizaynlar/")), "dizaynlar/ papkasi bor");

  const lateNew = waitFor<{ event: { type: string; severity: string } }>(teacher, "event:new", 5000, (p) => p.event.type === "LATE_JOIN");
  const late1 = student();
  const lateJoin = await joinOk(late1, exam.code, "Kech Keluvchi", "device-late-1");
  const lj = await lateNew;
  check(lateJoin.state.phase === "WORKING" && Boolean(lateJoin.state.files?.length), "kech kirgan o'quvchi darhol WORKING, fayllari bilan");
  check(lj.event.severity === "INFO", "kech kirish → LATE_JOIN (INFO)");
  late1.disconnect();

  const syncRes = await s1.emitWithAck("attempt:sync", {
    files: [
      { path: "index.html", content: "<h1>Salom</h1>" },
      { path: "src/new.js", content: "console.log(1)" },
      { path: "node_modules/x/index.js", content: "x" },
      { path: "savollar.md", content: "buzildi" },
      { path: "big.txt", content: "a".repeat(1024 * 1024 + 10) },
      { path: "../tashqari.js", content: "x" },
    ],
    deleted: ["script.js"],
  });
  check(syncRes.ok, "attempt:sync qabul qilindi");
  const reasons = syncRes.ok ? syncRes.rejected.map((r) => r.reason).sort().join(",") : "";
  check(reasons === "IGNORED,INVALID_PATH,READONLY,TOO_LARGE", `rad etilganlar: ${reasons}`);

  const focusNew = waitFor<{ event: { id: string; type: string; severity: string } }>(teacher, "event:new", 5000);
  const rep = await s2.emitWithAck("event:report", { type: "FOCUS_LOST", details: { at: Date.now() } });
  const ev = await focusNew;
  check(rep.ok && ev.event.type === "FOCUS_LOST" && ev.event.severity === "WARN", "FOCUS_LOST → o'qituvchiga event:new (WARN)");
  if (rep.ok) {
    const upd = waitFor<{ event: { id: string; details: unknown } }>(teacher, "event:new", 5000, (p) => p.event.id === rep.eventId);
    await s2.emitWithAck("event:report", { type: "FOCUS_LOST", eventId: rep.eventId, details: { durationSec: 7 } });
    const u = await upd;
    check(JSON.stringify(u.event.details).includes("durationSec"), "FOCUS_LOST davomiyligi bilan yangilandi");
  }
  const forged = await s2.emitWithAck("event:report", { type: "AI_INJECTION", details: {} });
  check(!forged.ok, "server-only event turi rad etildi");

  const timeSync = waitFor<{ endsAt: string }>(s1, "time:sync", 5000);
  await api("POST", `/exams/${exam.id}/extend`, token, { minutes: 5, attemptId: j1.attemptId });
  const ts = await timeSync;
  const diffMin = (Date.parse(ts.endsAt) - Date.parse(st1.endsAt)) / 60_000;
  check(Math.round(diffMin) === 5, `bitta o'quvchiga +5 daqiqa (time:sync, farq ${diffMin.toFixed(1)})`);

  console.log("  ... S2 internet uzilishi (11 s kutiladi)");
  const disconnected = waitFor<{ event: { type: string } }>(teacher, "event:new", 15_000, (p) => p.event.type === "DISCONNECTED");
  s2.io.engine.close();
  await disconnected;
  check(true, "uzilish > 10 s → DISCONNECTED");

  const s2b = student();
  const reconnected = waitFor<{ event: { type: string; details: unknown } }>(teacher, "event:new", 5000, (p) => p.event.type === "RECONNECTED");
  const deviceChanged = waitFor<{ event: { type: string; severity: string } }>(teacher, "event:new", 5000, (p) => p.event.type === "DEVICE_CHANGED");
  const j2b = await joinOk(s2b, exam.code, "Vali Aliyev", "device-vali-2"); // token yo'q — ism bo'yicha, boshqa kompyuter
  const rc = await reconnected;
  const dc = await deviceChanged;
  check(dc.event.severity === "DANGER", "boshqa qurilmadan ism bo'yicha kirish → DEVICE_CHANGED (DANGER)");
  check(j2b.attemptId === j2.attemptId && j2b.state.phase === "WORKING", "ism bo'yicha o'sha ishga qaytdi (WORKING)");
  check(Boolean(j2b.state.files?.length) && JSON.stringify(rc.event.details).includes("byName"), "fayllar tiklandi, RECONNECTED (byName)");

  const s1b = student();
  const oldKicked = waitFor<string>(s1, "disconnect", 5000);
  const j1b = await joinOk(s1b, exam.code, "Ali Valiyev", "device-ali-1", j1.token);
  await oldKicked;
  check(j1b.attemptId === j1.attemptId, "token bo'yicha qayta kirish, eski ulanish uzildi");
  check(j1b.state.files?.some((f) => f.path === "src/new.js") === true, "snapshot'da sync qilingan fayl bor");

  const ended1 = waitFor<void>(s1b, "exam:ended", 5000);
  const ended2 = waitFor<void>(s2b, "exam:ended", 5000);
  await api("POST", `/exams/${exam.id}/finish`, token);
  await Promise.all([ended1, ended2]);
  check(true, "finish → ikkalasiga exam:ended");
  const lastSync = await s1b.emitWithAck("attempt:sync", { files: [{ path: "final.js", content: "oxirgi" }] });
  check(lastSync.ok, "exam:ended dan keyin oxirgi sync qabul qilindi (15 s ichida)");

  const midway = await api<AttemptRow[]>("GET", `/exams/${exam.id}/attempts`, token);
  check(midway.every((a) => a.status === "WORKING"), "15 s o'tmaguncha hali WORKING");
  console.log("  ... 15 s kutish");
  await sleep(17_000);
  const after = await api<AttemptRow[]>("GET", `/exams/${exam.id}/attempts`, token);
  check(after.every((a) => a.status === "SUBMITTED"), `hammasi SUBMITTED (${after.map((a) => a.status).join(", ")})`);
  const examAfter = await api<ExamRow>("GET", `/exams/${exam.id}`, token);
  check(examAfter.status === "GRADING" && examAfter.code === null, `imtihon GRADING, kod bo'shatildi (${examAfter.status})`);
  const detail = await api<AttemptDetail>("GET", `/attempts/${j1.attemptId}`, token);
  const finalPaths = detail.files.map((f) => f.path);
  check(finalPaths.includes("final.js") && !finalPaths.includes("script.js"), "yakuniy snapshot: final.js bor, script.js o'chirilgan");
  const late = await s1b.emitWithAck("attempt:sync", { files: [{ path: "late.js", content: "kech" }] });
  check(!late.ok, "topshirilgandan keyin sync rad etildi");
  s1b.disconnect();
  s2b.disconnect();
}

async function timerFlow(token: string) {
  console.log("\n== Timer: 1 daqiqalik imtihon, time:sync va avtomatik tugash");
  const exam = await createOpenExam(token, "Smoke: timer", 1, false);
  const s = student();
  await joinOk(s, exam.code, "Timer Test", "device-timer-1");
  const gotSync = waitFor<{ endsAt: string }>(s, "time:sync", 35_000);
  const ended = waitFor<void>(s, "exam:ended", 70_000);
  await api("POST", `/exams/${exam.id}/start`, token);
  await gotSync;
  check(true, "[timer] 30 s ichida time:sync keldi");
  await ended;
  check(true, "[timer] vaqt tugaganda exam:ended");
  await sleep(17_000);
  const examAfter = await api<ExamRow>("GET", `/exams/${exam.id}`, token);
  const attempts = await api<AttemptRow[]>("GET", `/exams/${exam.id}/attempts`, token);
  check(attempts[0]?.status === "SUBMITTED", "[timer] o'quvchi SUBMITTED");
  check(examAfter.status === "FINISHED", `[timer] AI o'chiq → FINISHED (${examAfter.status})`);
  s.disconnect();
}

async function submitFlow(token: string, teacher: TeacherSocket) {
  console.log("\n== Ilova yopilishi va erta topshirish");
  const exam = await createOpenExam(token, "Smoke: topshirish", 30, true);
  const watch = await teacher.emitWithAck("exam:watch", { examId: exam.id });
  check(watch.ok, "[submit] exam:watch");
  const s = student();
  const j = await joinOk(s, exam.code, "Erta Topshiruvchi", "device-erta-1");
  await api("POST", `/exams/${exam.id}/start`, token);
  await sleep(300);
  const closed = waitFor<{ event: { type: string } }>(teacher, "event:new", 5000, (p) => p.event.type === "APP_CLOSED");
  s.disconnect(); // ilova yopildi
  await closed;
  check(true, "[submit] ilova yopilishi → APP_CLOSED");
  const s2 = student();
  const back = waitFor<{ event: { type: string } }>(teacher, "event:new", 5000, (p) => p.event.type === "RECONNECTED");
  await joinOk(s2, exam.code, "Erta Topshiruvchi", "device-erta-1", j.token);
  await back;
  check(true, "[submit] qayta ochilganda RECONNECTED");
  const ended = waitFor<void>(s2, "exam:ended", 3000);
  const sub = await s2.emitWithAck("attempt:submit");
  await ended;
  check(sub.ok, "[submit] attempt:submit → exam:ended");
  await sleep(17_000);
  const attempts = await api<AttemptRow[]>("GET", `/exams/${exam.id}/attempts`, token);
  check(attempts[0]?.status === "SUBMITTED", "[submit] 15 s dan keyin SUBMITTED");
  const examAfter = await api<ExamRow>("GET", `/exams/${exam.id}`, token);
  check(examAfter.status === "RUNNING", "[submit] imtihon vaqti tugamagani uchun hali RUNNING");
  await api("POST", `/exams/${exam.id}/finish`, token);
  await sleep(2500);
  const finished = await api<ExamRow>("GET", `/exams/${exam.id}`, token);
  check(finished.status === "GRADING", `[submit] finish → hamma topshirgan, GRADING (${finished.status})`);
  s2.disconnect();
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "demo@kodim.uz", password: "demo12345" }),
  });
  const { token } = (await login.json()) as { token: string };

  const badTeacher: TeacherSocket = io(`${BASE}/teacher`, { transports: ["websocket"], auth: { token: "xato" }, reconnection: false });
  const rejected = await new Promise<boolean>((r) => {
    badTeacher.on("connect_error", () => r(true));
    badTeacher.on("connect", () => r(false));
  });
  check(rejected, "noto'g'ri JWT bilan /teacher ulanishi rad etildi");
  badTeacher.close();

  const teacher: TeacherSocket = io(`${BASE}/teacher`, { transports: ["websocket"], auth: { token } });
  await waitFor(teacher, "connect", 5000);

  const teacher2: TeacherSocket = io(`${BASE}/teacher`, { transports: ["websocket"], auth: { token } });
  await waitFor(teacher2, "connect", 5000);

  await Promise.all([mainFlow(token, teacher), timerFlow(token), submitFlow(token, teacher2)]);
  teacher.close();
  teacher2.close();

  console.log(failures.length ? `\n${failures.length} ta XATO:\n- ${failures.join("\n- ")}` : "\nHammasi o'tdi.");
  process.exit(failures.length ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
