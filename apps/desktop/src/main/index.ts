import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, net, protocol } from "electron";
import { BRAND } from "@exam-ide/shared";
import { IPC } from "../common/api";
import { registerIpc } from "./ipc";
import { ExamSession } from "./session";

// Renderer `app://` sxemasidan yuklanadi: file:// dan xavfsizroq va Monaco worker'lari bir xil origin'da ishlaydi.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
]);

app.setName(BRAND.name);
app.setAppUserModelId(BRAND.appId);

let mainWindow: BrowserWindow | null = null;

const session = new ExamSession({
  onStateChange: (state) => mainWindow?.webContents.send(IPC.state, state),
});

function registerAppProtocol(): void {
  const rendererDir = join(__dirname, "../renderer");
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    const file = resolve(rendererDir, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(rendererDir + sep)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: BRAND.name,
    backgroundColor: "#1e1e1e",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow = win;
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  win.on("closed", () => {
    mainWindow = null;
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadURL("app://kodim/index.html");
}

registerIpc(session, () => mainWindow?.webContents ?? null);

void app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();
});

app.on("before-quit", () => session.disconnect());
app.on("window-all-closed", () => app.quit());
