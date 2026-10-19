// Ichki brauzer sahifalari uchun preload (izolyatsiyalangan dunyo): drag & drop yo'q,
// copy/cut/paste faqat ilovaning ichki clipboard'i bilan (CLAUDE.md 5.4, 5.6).
import { ipcRenderer } from "electron";

type TextField = HTMLInputElement | HTMLTextAreaElement;

const isField = (t: EventTarget | null): t is TextField => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

function selected(target: EventTarget | null): string {
  if (isField(target)) return target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
  return window.getSelection()?.toString() ?? "";
}

function stop(e: Event): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

for (const type of ["dragstart", "dragenter", "dragover", "drop"]) {
  window.addEventListener(type, (e) => {
    stop(e);
    if (e instanceof DragEvent && e.dataTransfer) e.dataTransfer.dropEffect = "none";
  }, true);
}

for (const type of ["copy", "cut"] as const) {
  window.addEventListener(type, (e) => {
    // Sahifa skriptlari ham tizim clipboard'iga yoza olmasin.
    stop(e);
    const text = selected(e.target);
    if (text) ipcRenderer.send("browser:copy", text);
    if (type === "cut" && isField(e.target) && text && !e.target.readOnly) document.execCommand("delete");
  }, true);
}

window.addEventListener("paste", (e) => {
  stop(e);
  const target = e.target;
  void ipcRenderer.invoke("browser:paste").then((text: unknown) => {
    if (typeof text === "string" && text && document.activeElement === target) {
      document.execCommand("insertText", false, text);
    }
  });
}, true);
