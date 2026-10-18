import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ClientState, type KodimApi } from "../common/api";

// Renderer'ga faqat shu aniq funksiyalar beriladi (Node API yo'q).
const api: KodimApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, state: ClientState) => listener(state);
    ipcRenderer.on(IPC.state, handler);
    return () => ipcRenderer.off(IPC.state, handler);
  },
  getLastName: () => ipcRenderer.invoke(IPC.lastName),
  join: (code, name) => ipcRenderer.invoke(IPC.join, code, name),
  submit: () => ipcRenderer.invoke(IPC.submit),
  fs: {
    list: (dir) => ipcRenderer.invoke(IPC.fsList, dir),
    read: (path) => ipcRenderer.invoke(IPC.fsRead, path),
    write: (path, content) => ipcRenderer.invoke(IPC.fsWrite, path, content),
    createFile: (path) => ipcRenderer.invoke(IPC.fsCreateFile, path),
    createDir: (path) => ipcRenderer.invoke(IPC.fsCreateDir, path),
    rename: (from, to) => ipcRenderer.invoke(IPC.fsRename, from, to),
    remove: (path) => ipcRenderer.invoke(IPC.fsRemove, path),
  },
};

contextBridge.exposeInMainWorld("kodim", api);
