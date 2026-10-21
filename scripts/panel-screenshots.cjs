// Panel sahifalarining skrinshotlari (dizayn tekshiruvi uchun): docs/screenshots/<papka>/panel-*.png
// Ishga tushirish (server ishlab turganda):
//   apps/desktop/node_modules/.bin/electron scripts/panel-screenshots.cjs <papka> [URL] [email] [parol]
// Masalan: ... scripts/panel-screenshots.cjs after http://localhost:8080 demo@kodim.uz demo12345
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const [folder = "after", base = "http://localhost:8080", email = "demo@kodim.uz", password = "demo12345"] = process.argv.slice(2);
const out = join(__dirname, "..", "docs", "screenshots", folder);
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, token, init = {}) {
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }), ...init.headers },
  });
  return res.json();
}

async function shoot(win, name, url, { wait = 1800, width = 1440, height = 900 } = {}) {
  win.setContentSize(width, height);
  await win.loadURL(url);
  await sleep(wait);
  // Butun sahifa balandligi (uzun sahifalar uchun), 2400px gacha.
  const full = await win.webContents.executeJavaScript(
    "Math.min(2400, Math.max(document.documentElement.scrollHeight, document.querySelector('.content')?.scrollHeight ?? 0))",
  );
  if (full > height) {
    win.setContentSize(width, full);
    await sleep(500);
  }
  const img = await win.webContents.capturePage();
  writeFileSync(join(out, `${name}.png`), img.toPNG());
  console.log("saqlandi:", name);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { offscreen: false } });
  // 1) Login (token yo'q)
  await win.loadURL(base);
  await win.webContents.executeJavaScript("localStorage.clear()");
  await shoot(win, "panel-login", `${base}/`);
  await shoot(win, "panel-login-phone", `${base}/`, { width: 390, height: 844 });

  const { token } = await api("/auth/login", null, { method: "POST", body: JSON.stringify({ email, password }) });
  await win.loadURL(base);
  await win.webContents.executeJavaScript(`localStorage.setItem('kodim.token', ${JSON.stringify(token)})`);
  const exams = await api("/exams", token);
  const running = exams.find((e) => e.status === "RUNNING" || e.status === "LOBBY");
  const finished = exams.find((e) => e.status === "FINISHED" && e._count.attempts > 0);
  const figma = exams.find((e) => e.title.includes("Figma")) ?? exams[0];

  await shoot(win, "panel-exams", `${base}/`);
  await shoot(win, "panel-exams-phone", `${base}/`, { width: 390, height: 844 });
  await shoot(win, "panel-new-exam", `${base}/exams/new`);
  if (figma) await shoot(win, "panel-edit-figma", `${base}/exams/${figma.id}/edit`, { wait: 2500 });
  if (running) {
    await shoot(win, "panel-live", `${base}/exams/${running.id}/live`, { wait: 2500 });
    await shoot(win, "panel-live-phone", `${base}/exams/${running.id}/live`, { wait: 2500, width: 390, height: 844 });
  }
  if (finished) {
    await shoot(win, "panel-results", `${base}/exams/${finished.id}/results`);
    await shoot(win, "panel-submissions", `${base}/exams/${finished.id}/submissions`, { wait: 2500 });
    const attempts = await api(`/exams/${finished.id}/attempts`, token);
    if (attempts[0]) await shoot(win, "panel-attempt", `${base}/attempts/${attempts[0].id}`, { wait: 2500 });
  }
  await shoot(win, "panel-settings", `${base}/settings`);
  await shoot(win, "panel-notfound", `${base}/exams/yoq/live`);
  app.quit();
});
