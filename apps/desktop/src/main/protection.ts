import { app, BrowserWindow, session, type WebContents } from "electron";

// CLAUDE.md 5.3: oyna va jarayon darajasidagi himoyalar.

/** Bloklanadigan tugmalar: DevTools va sahifani qayta yuklash. */
function isBlockedShortcut(input: Electron.Input): boolean {
  const key = input.key.toLowerCase();
  const ctrl = input.control || input.meta;
  if (key === "f12" || key === "f5") return true;
  if (ctrl && input.shift && ["i", "j", "c", "r"].includes(key)) return true;
  if (ctrl && !input.shift && key === "r") return true;
  return false;
}

/**
 * Ilova darajasidagi himoya. `false` qaytarsa — ilova yopilishi kerak
 * (ikkinchi nusxa yoki production'da debug rejimida ishga tushirilgan).
 */
export function hardenApp(): boolean {
  if (!app.requestSingleInstanceLock()) return false;
  if (app.isPackaged) {
    const debugSwitches = ["remote-debugging-port", "remote-debugging-pipe", "inspect", "inspect-brk", "js-flags"];
    if (debugSwitches.some((s) => app.commandLine.hasSwitch(s))) return false;
    if (process.argv.some((a) => /^--(inspect|remote-debugging)/.test(a))) return false;
  }

  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // Har qanday yangi webContents uchun: yangi oyna va <webview> yo'q.
  app.on("web-contents-created", (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-attach-webview", (e) => e.preventDefault());
  });
  return true;
}

/** Default session: hech qanday ruxsat (kamera, clipboard o'qish/yozish, bildirishnoma...) va yuklab olish yo'q. */
export function hardenDefaultSession(): void {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.setPermissionCheckHandler(() => false);
  s.on("will-download", (e) => e.preventDefault());
}

/** Asosiy oyna: screenshot/yozuvdan himoya, tashqi navigatsiya va DevTools tugmalari bloki. */
export function hardenWindow(win: BrowserWindow, isAppUrl: (url: string) => boolean): void {
  win.setContentProtection(true);
  hardenContents(win.webContents, isAppUrl);
}

export function hardenContents(contents: WebContents, isAllowedUrl: (url: string) => boolean): void {
  contents.on("will-navigate", (e, url) => {
    if (!isAllowedUrl(url)) e.preventDefault();
  });
  contents.on("will-redirect", (e, url) => {
    if (!isAllowedUrl(url)) e.preventDefault();
  });
  contents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && isBlockedShortcut(input)) e.preventDefault();
  });
  if (app.isPackaged) {
    contents.on("devtools-opened", () => contents.closeDevTools());
  }
}
