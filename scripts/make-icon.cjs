// Ilova ikonkasi (brand): apps/desktop/build/icon.png (512x512) va landing favicon.
//   apps/desktop/node_modules/.bin/electron scripts/make-icon.cjs
const { app, BrowserWindow } = require("electron");
const { writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:512px;height:512px;display:grid;place-items:center">
  <div style="width:448px;height:448px;border-radius:100px;background:linear-gradient(145deg,#27272a,#09090b);display:grid;place-items:center;box-shadow:inset 0 0 0 6px #3f3f46">
    <svg width="300" height="300" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 7 3 12l5 5" stroke="#fafafa" stroke-width="2.2"/>
      <path d="m16 7 5 5-5 5" stroke="#fafafa" stroke-width="2.2"/>
      <path d="M13.5 4.5 10.5 19.5" stroke="#6366f1" stroke-width="2.2"/>
    </svg>
  </div>
</div></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 512, height: 512, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const root = join(__dirname, "..");
  writeFileSync(join(root, "apps/desktop/build/icon.png"), img.resize({ width: 512, height: 512 }).toPNG());
  // Windows .ico: PNG yozuvlari bilan (16…256). Format: ICONDIR + ICONDIRENTRY[] + PNG ma'lumotlari.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map((s) => img.resize({ width: s, height: s, quality: "best" }).toPNG());
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(join(root, "apps/desktop/build/icon.ico"), Buffer.concat([header, ...pngs]));
  mkdirSync(join(root, "apps/landing/public"), { recursive: true });
  writeFileSync(join(root, "apps/landing/public/icon.png"), img.resize({ width: 256, height: 256 }).toPNG());
  writeFileSync(join(root, "apps/landing/public/favicon.png"), img.resize({ width: 64, height: 64 }).toPNG());
  console.log("ikonka tayyor");
  app.quit();
});
