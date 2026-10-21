import { contextBridge, ipcRenderer } from "electron";
import { IPC, type BrowserState, type ClientState, type KodimApi } from "../common/api";

function subscribe<A extends unknown[]>(channel: string, listener: (...args: A) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...(args as A));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

// Renderer'ga faqat shu aniq funksiyalar beriladi (Node API yo'q).
const api: KodimApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, state: ClientState) => listener(state);
    ipcRenderer.on(IPC.state, handler);
    return () => ipcRenderer.off(IPC.state, handler);
  },
  getLastName: () => ipcRenderer.invoke(IPC.lastName),
  onDiskChange: (listener) => subscribe<[string]>(IPC.diskChange, listener),
  reportLargeInsert: (chars) => ipcRenderer.send(IPC.reportLargeInsert, chars),
  reportEvent: (type, details) => ipcRenderer.send(IPC.reportEvent, type, details ?? {}),
  join: (code, name) => ipcRenderer.invoke(IPC.join, code, name),
  submit: () => ipcRenderer.invoke(IPC.submit),
  clipboard: {
    write: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
    paste: (source) => ipcRenderer.invoke(IPC.clipboardPaste, source),
  },
  terminal: {
    profiles: () => ipcRenderer.invoke(IPC.termProfiles),
    setDefault: (kind) => ipcRenderer.send(IPC.termSetDefault, kind),
    create: (kind, cols, rows) => ipcRenderer.invoke(IPC.termCreate, kind, cols, rows),
    submit: (id, line) => ipcRenderer.invoke(IPC.termSubmit, id, line),
    interrupt: (id) => ipcRenderer.send(IPC.termInterrupt, id),
    complete: (id, prefix) => ipcRenderer.invoke(IPC.termComplete, id, prefix),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.termResize, id, cols, rows),
    kill: (id) => ipcRenderer.send(IPC.termKill, id),
    onData: (listener) => subscribe<[number, string]>(IPC.termData, listener),
    onExit: (listener) => subscribe<[number, number]>(IPC.termExit, listener),
    onBusy: (listener) => subscribe<[number, boolean]>(IPC.termBusy, listener),
  },
  browser: {
    setBounds: (rect) => ipcRenderer.send(IPC.browserBounds, rect),
    navigate: (url) => ipcRenderer.invoke(IPC.browserNavigate, url),
    back: () => ipcRenderer.send(IPC.browserBack),
    forward: () => ipcRenderer.send(IPC.browserForward),
    reload: () => ipcRenderer.send(IPC.browserReload),
    goLive: () => ipcRenderer.invoke(IPC.browserGoLive),
    onState: (listener) => subscribe<[BrowserState]>(IPC.browserState, listener),
    onEscape: (listener) => subscribe<[]>(IPC.browserEscape, listener),
  },
  fs: {
    list: (dir) => ipcRenderer.invoke(IPC.fsList, dir),
    read: (path) => ipcRenderer.invoke(IPC.fsRead, path),
    readImage: (path) => ipcRenderer.invoke(IPC.fsReadImage, path),
    write: (path, content) => ipcRenderer.invoke(IPC.fsWrite, path, content),
    createFile: (path) => ipcRenderer.invoke(IPC.fsCreateFile, path),
    createDir: (path) => ipcRenderer.invoke(IPC.fsCreateDir, path),
    rename: (from, to) => ipcRenderer.invoke(IPC.fsRename, from, to),
    move: (from, toDir) => ipcRenderer.invoke(IPC.fsMove, from, toDir),
    copy: (from, toDir) => ipcRenderer.invoke(IPC.fsCopy, from, toDir),
    remove: (path) => ipcRenderer.invoke(IPC.fsRemove, path),
  },
};

contextBridge.exposeInMainWorld("kodim", api);
