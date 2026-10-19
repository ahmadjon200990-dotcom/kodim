// Sinov uchun soxta o'quvchi (ikkinchi kompyuter o'rniga): node dist/dev/fake-student.js <kod> <ism> [deviceId]
// Ulangan holda turadi; stdin'dan buyruq oladi: "event <TYPE>", "quit", "close" (APP_CLOSED).
import { createInterface } from "node:readline";
import { io, type Socket } from "socket.io-client";
import type { StudentClientToServer, StudentServerToClient } from "@exam-ide/shared";

const [code = "", name = "Soxta O'quvchi", deviceId = "fake-device-0001"] = process.argv.slice(2);
const BASE = process.env.SMOKE_URL ?? "http://127.0.0.1:8080";
const s: Socket<StudentServerToClient, StudentClientToServer> = io(`${BASE}/student`, { transports: ["websocket"] });

s.on("connect", () => {
  void s.emitWithAck("student:join", { code, name, deviceId }).then((r) => console.log("join:", JSON.stringify(r).slice(0, 200)));
});
s.on("exam:started", (p) => console.log("exam:started", p.endsAt, p.files.map((f) => f.path).join(",")));
s.on("time:sync", (p) => console.log("time:sync", p.endsAt));
s.on("lobby:count", (p) => console.log("lobby:count", p.joinedCount));
s.on("exam:ended", () => console.log("exam:ended"));

createInterface({ input: process.stdin }).on("line", (line) => {
  const [cmd, arg] = line.trim().split(/\s+/);
  if (cmd === "event" && arg) {
    void s.emitWithAck("event:report", { type: arg as never, details: { test: true } }).then((r) => console.log("event:", JSON.stringify(r)));
  } else if (cmd === "close") {
    s.disconnect();
    process.exit(0);
  } else if (cmd === "quit") process.exit(0);
});
