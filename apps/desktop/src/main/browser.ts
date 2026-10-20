import { join } from "node:path";
import { app, ipcMain, session, WebContentsView, type BrowserWindow } from "electron";
import type { BrowserState, Rect } from "../common/api";
import { pasteInternal, writeInternal } from "./clipboard";
import { hardenContents } from "./protection";

// Ichki brauzer (CLAUDE.md 5.6): alohida session, faqat localhost va Figma.

export const BROWSER_PARTITION = "persist:exam-browser";

/** Figma ishlashi uchun kerakli domenlar (subdomenlari bilan). Sinovda aniqlangan. */
const FIGMA_DOMAINS = ["figma.com", "figmausercontent.com", "figma.net"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isAllowedBrowserUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if ((u.protocol === "http:" || u.protocol === "ws:") && LOCAL_HOSTS.has(u.hostname)) return true;
  if (u.protocol === "https:" || u.protocol === "wss:") {
    return FIGMA_DOMAINS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
  }
  // Sahifa ichidagi data:/blob: resurslar (Figma rasmlari va h.k.).
  return u.protocol === "data:" || u.protocol === "blob:" || raw === "about:blank";
}

/** "localhost:5173" kabi qisqa yozuvni to'liq manzilga aylantiradi. */
function normalize(input: string): string {
  const s = input.trim();
  if (/^[a-z]+:\/\//i.test(s)) return s;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(s)) return `http://${s}`;
  return `https://${s}`;
}

export class ExamBrowser {
  private view: WebContentsView | null = null;
  private configured = false;
  state: BrowserState = { url: "", title: "", canGoBack: false, canGoForward: false, loading: false };

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly push: (state: BrowserState) => void,
    private readonly reportPaste: (details: { source: "browser"; length: number }) => void,
    private readonly reportBlocked: (url: string) => void,
  ) {}

  private configureSession(): void {
    if (this.configured) return;
    this.configured = true;
    const s = session.fromPartition(BROWSER_PARTITION);
    s.webRequest.onBeforeRequest((details, callback) => {
      const allowed = isAllowedBrowserUrl(details.url);
      if (!allowed) {
        if (!app.isPackaged) console.log("[brauzer] bloklandi:", details.url.slice(0, 120));
        // Faqat sahifaga o'tish urinishlari xabar qilinadi (analitika/resurslar emas).
        if (details.resourceType === "mainFrame") this.reportBlocked(details.url);
      }
      callback({ cancel: !allowed });
    });
    s.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    s.setPermissionCheckHandler(() => false);
    s.on("will-download", (e) => e.preventDefault());

    // Brauzer sahifasidagi copy/paste ham ichki clipboard bilan (preload/browser.ts).
    ipcMain.on("browser:copy", (e, text: unknown) => {
      if (e.sender === this.view?.webContents && typeof text === "string") writeInternal(text);
    });
    ipcMain.handle("browser:paste", (e) => {
      if (e.sender !== this.view?.webContents) return "";
      return pasteInternal("browser", (d) => this.reportPaste({ source: "browser", length: d.length }));
    });
  }

  private ensure(): WebContentsView {
    if (this.view) return this.view;
    const win = this.getWindow();
    if (!win) throw new Error("oyna yo'q");
    this.configureSession();
    const view = new WebContentsView({
      webPreferences: {
        partition: BROWSER_PARTITION,
        preload: join(__dirname, "../preload/browser.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false,
        spellcheck: false,
      },
    });
    view.setBackgroundColor("#ffffff");
    win.contentView.addChildView(view);
    hardenContents(view.webContents, isAllowedBrowserUrl);
    const wc = view.webContents;
    const update = () => {
      this.state = {
        url: wc.getURL(),
        title: wc.getTitle(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        loading: wc.isLoading(),
      };
      this.push(this.state);
    };
    for (const ev of ["did-navigate", "did-navigate-in-page", "page-title-updated", "did-start-loading", "did-stop-loading"] as const) {
      wc.on(ev as "did-stop-loading", update);
    }
    view.setVisible(false);
    this.view = view;
    return view;
  }

  /** Renderer'dagi joy (CSS px). `null` — panel yopiq yoki ustida modal oyna bor. */
  setBounds(rect: Rect | null): void {
    if (!rect) {
      this.view?.setVisible(false);
      return;
    }
    const view = this.ensure();
    view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
    });
    view.setVisible(true);
  }

  navigate(input: string): boolean {
    const url = normalize(input);
    if (!isAllowedBrowserUrl(url) || url.startsWith("data:") || url.startsWith("blob:")) return false;
    void this.ensure().webContents.loadURL(url).catch(() => undefined);
    return true;
  }

  back(): void {
    const h = this.view?.webContents.navigationHistory;
    if (h?.canGoBack()) h.goBack();
  }

  forward(): void {
    const h = this.view?.webContents.navigationHistory;
    if (h?.canGoForward()) h.goForward();
  }

  reload(): void {
    this.view?.webContents.reload();
  }

  /** Vaqt tugaganda: sahifa bo'shatiladi va yashiriladi. */
  reset(): void {
    if (!this.view) return;
    void this.view.webContents.loadURL("about:blank");
    this.view.setVisible(false);
  }
}
