// Sinov vositasi: ishlab turgan Kodim oynasini CDP orqali boshqarish (ilova `--remote-debugging-port=9222` bilan).
//   node apps/desktop/scripts/cdp.mjs eval "<js — natija return bilan>"
//   node apps/desktop/scripts/cdp.mjs shot fayl.png [kenglik balandlik]
//   node apps/desktop/scripts/cdp.mjs type "matn"        — fokusdagi elementga yozish
//   node apps/desktop/scripts/cdp.mjs key Enter|Tab|...   — tugma bosish
//   node apps/desktop/scripts/cdp.mjs click x y           — sichqoncha bosish
//   node apps/desktop/scripts/cdp.mjs move x y            — sichqonchani olib borish
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";

const CDP = process.env.CDP_URL ?? "http://localhost:9222";
const [cmd, ...args] = process.argv.slice(2);

const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
const page = list.find((p) => p.type === "page" && (p.url.startsWith("app://") || p.url.startsWith("http://localhost:5")));
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

const KEYS = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  F2: { key: "F2", code: "F2", windowsVirtualKeyCode: 113 },
};

if (cmd === "eval") {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${args[0]}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) console.error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
  console.log(JSON.stringify(r.result?.result?.value, null, 1));
} else if (cmd === "shot") {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(args[0] ?? "shot.png", Buffer.from(r.result.data, "base64"));
  console.log("saqlandi:", args[0]);
} else if (cmd === "type") {
  await send("Input.insertText", { text: args[0] ?? "" });
} else if (cmd === "key") {
  const [mods, name] = (args[0] ?? "").includes("+") ? [args[0].split("+").slice(0, -1), args[0].split("+").pop()] : [[], args[0]];
  const k = KEYS[name] ?? { key: name, code: `Key${name.toUpperCase()}`, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0) };
  const modifiers = (mods.includes("Ctrl") ? 2 : 0) | (mods.includes("Shift") ? 8 : 0) | (mods.includes("Alt") ? 1 : 0);
  await send("Input.dispatchKeyEvent", { type: "keyDown", modifiers, ...k });
  await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers, ...k, text: undefined });
} else if (cmd === "click" || cmd === "move") {
  const x = Number(args[0]);
  const y = Number(args[1]);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  if (cmd === "click") {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
} else {
  console.log("buyruqlar: eval | shot | type | key | click | move");
}
ws.close();
