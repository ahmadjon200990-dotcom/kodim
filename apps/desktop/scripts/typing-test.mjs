// Avtomatik yozish sinovi (CLAUDE.md "Demo Day 3" — kursor sakrashi regressiyasi).
// Electron ilova `--remote-debugging-port=9222` bilan ishlab turishi va imtihon boshlangan bo'lishi kerak.
//   node apps/desktop/scripts/typing-test.mjs [kod] [ism]
// Login ekranida bo'lsa — kod va ism bilan kiradi, qoidalarni qabul qiladi.
// Har fayl turi (html, css, js, jsx) uchun 300+ belgini bo'laklab yozadi (avtosaqlash 400 ms va sync 5 s
// vaqtlaridan o'tib), so'ng editor matni, diskdagi matn va kursor oxirida ekanini tekshiradi.

const CDP = process.env.CDP_URL ?? "http://localhost:9222";
const [code, name] = process.argv.slice(2);

const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
const page = list.find((p) => p.type === "page" && p.url.startsWith("app://"));
if (!page) throw new Error("Kodim oynasi topilmadi (CDP)");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
}
async function waitFor(expression, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`return Boolean(${expression});`)) return;
    await sleep(200);
  }
  throw new Error(`Kutilgan holat bo'lmadi: ${expression}`);
}

const SET = `const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;d.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};`;

// 1) Kirish (kerak bo'lsa)
if (await evaluate(`return !!document.querySelector('.login');`)) {
  if (!code || !name) throw new Error("Login ekrani: kod va ism bering");
  await evaluate(`${SET} const i=document.querySelectorAll('.login input'); set(i[0],${JSON.stringify(code)}); set(i[1],${JSON.stringify(name)}); document.querySelector('.login button[type=submit]').click();`);
  await waitFor(`document.querySelector('.rules-card')`);
}
if (await evaluate(`return !!document.querySelector('.rules-card');`)) {
  await evaluate(`document.querySelector('.rules-card button').click();`);
}
await waitFor(`document.querySelector('.ws')`, 15_000);

const TEXT = "ism qiymat ".repeat(30).trim(); // 329 belgi, qavs/tirnoqsiz — avto-yopish aralashmasin
const results = [];

for (const ext of ["html", "css", "js", "jsx"]) {
  const file = `yozish_sinovi_${Date.now() % 100000}.${ext}`;
  await evaluate(`const r = await window.kodim.fs.createFile(${JSON.stringify(file)}); if(!r.ok) throw new Error(r.error);`);
  // Daraxtni yangilab, faylni ochamiz.
  await evaluate(`document.querySelector('.tree .pane-actions button[title="Yangilash"]')?.click();`);
  await waitFor(`document.querySelector('.tree-row[title=${JSON.stringify(file)}]')`);
  await evaluate(`document.querySelector('.tree-row[title=${JSON.stringify(file)}]').click();`);
  await waitFor(`document.querySelector('.breadcrumbs')?.textContent.includes(${JSON.stringify(file)})`);
  await sleep(300);
  await evaluate(`document.querySelector('.editor-monaco .native-edit-context, .editor-monaco textarea')?.focus();`);

  const started = Date.now();
  for (let i = 0; i < TEXT.length; i += 20) {
    for (const ch of TEXT.slice(i, i + 20)) {
      await send("Input.insertText", { text: ch });
      await sleep(25);
    }
    await sleep(650); // avtosaqlash (400 ms) va disk watcher ishga tushsin
  }
  await sleep(1500);
  const state = await evaluate(`
    const disk = await window.kodim.fs.read(${JSON.stringify(file)});
    const view = [...document.querySelectorAll('.editor-monaco .view-line')].map(l=>l.textContent.replace(/\\u00a0/g,' ')).join('\\n');
    const sb = [...document.querySelectorAll('.statusbar .sb-item')].map(s=>s.textContent).find(t=>t.includes('Qator')) ?? '';
    return { disk, view, sb };`);
  const m = /Qator\s+(\d+),\s*Ustun\s+(\d+)/.exec(state.sb);
  const okDisk = state.disk === TEXT;
  const okCursor = m && Number(m[1]) === 1 && Number(m[2]) === TEXT.length + 1;
  results.push({ ext, seconds: Math.round((Date.now() - started) / 1000), okDisk, okCursor: Boolean(okCursor), cursor: state.sb, diskLen: state.disk.length });
  await evaluate(`await window.kodim.fs.remove(${JSON.stringify(file)});`);
}

console.table(results);
ws.close();
const failed = results.filter((r) => !r.okDisk || !r.okCursor);
if (failed.length) {
  console.error(`XATO: ${failed.length} ta fayl turida matn/kursor noto'g'ri`);
  process.exit(1);
}
console.log("OK: barcha fayl turlarida matn to'g'ri, kursor oxirida");
