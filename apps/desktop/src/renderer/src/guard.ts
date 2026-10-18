// Renderer darajasidagi himoya (CLAUDE.md 5.3, 5.4):
// - drag & drop butunlay bloklanadi (tashqi fayl/matn olib kirib bo'lmaydi);
// - input/textarea'da copy/cut/paste faqat ilovaning ichki clipboard'i bilan ishlaydi.
// Monaco o'z buyruqlari orqali ishlaydi (EditorPane), terminal — o'z handleri orqali.

type TextField = HTMLInputElement | HTMLTextAreaElement;

function textField(target: EventTarget | null): TextField | null {
  if (target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLInputElement && ["text", "search", "url", "tel", "password", "email", ""].includes(target.type)) {
    return target;
  }
  return null;
}

/** Monaco va xterm o'z clipboard handleriga ega. */
function ownsClipboard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".monaco-editor, .xterm") !== null;
}

function selectedText(field: TextField | null): string {
  if (field) return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
  return window.getSelection()?.toString() ?? "";
}

function onCopyOrCut(cut: boolean) {
  return (e: ClipboardEvent) => {
    // Tizim clipboard'iga hech narsa yozilmasin.
    e.preventDefault();
    if (ownsClipboard(e.target)) return;
    const field = textField(e.target);
    const text = selectedText(field);
    if (!text) return;
    void window.kodim.clipboard.write(text);
    if (cut && field && !field.readOnly && !field.disabled) document.execCommand("delete");
  };
}

async function onPaste(e: ClipboardEvent): Promise<void> {
  e.preventDefault();
  e.stopPropagation();
  if (ownsClipboard(e.target)) return;
  const field = textField(e.target);
  if (!field || field.readOnly || field.disabled) return;
  const text = await window.kodim.clipboard.paste("input");
  if (text && document.activeElement === field) document.execCommand("insertText", false, text);
}

export function installGuards(): void {
  const block = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  };
  for (const type of ["dragstart", "dragenter", "dragover", "drop"] as const) {
    document.addEventListener(type, block, true);
  }
  document.addEventListener("copy", onCopyOrCut(false), true);
  document.addEventListener("cut", onCopyOrCut(true), true);
  document.addEventListener("paste", (e) => void onPaste(e), true);
  // Standart kontekst menyu yo'q — ilovaning o'z menyulari (fayllar paneli, editor) ishlatiladi.
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}
