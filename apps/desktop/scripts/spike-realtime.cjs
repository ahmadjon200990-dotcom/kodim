// 1-faza spike (tashlab yuboriladi): Electron main process'da supabase-js Realtime.
// Ishga tushirish: pnpm --filter @exam-ide/desktop exec electron scripts/spike-realtime.cjs [private]
const { app } = require("electron");
const { createClient } = require("@supabase/supabase-js");

const URL = "https://prkrhitgkjyuwyipqimw.supabase.co";
const KEY = "sb_publishable_SrliT3-Dc98IWucZ1Zt_hg_5AXtIOQf";
const mode = process.argv.includes("private") ? "private" : "public";

app.whenReady().then(async () => {
  console.log("electron", process.versions.electron, "node", process.versions.node, "WebSocket", typeof globalThis.WebSocket);
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  if (mode === "private") {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) { console.log("ANON ERROR", error.message); app.exit(1); return; }
    console.log("anon uid", data.user.id);
    await sb.realtime.setAuth();
  }
  const topic = mode === "private" ? "spike:private" : "spike:public";
  const got = [];
  const ch = sb.channel(topic, { config: { private: mode === "private" } });
  ch.on("broadcast", { event: "tick" }, ({ payload }) => {
    const lag = Date.now() - new Date(payload.at).getTime();
    got.push(payload);
    console.log("tick", payload.id, "lag_ms", lag);
  }).subscribe((status, err) => console.log("status", status, err ? err.message : ""));
  setTimeout(() => {
    const ids = got.map((p) => p.id);
    const gaps = got.slice(1).map((p, i) => new Date(p.at) - new Date(got[i].at));
    console.log("RESULT", JSON.stringify({ mode, count: got.length, ids, gaps }));
    app.exit(got.length >= 4 ? 0 : 2);
  }, 14000);
});
