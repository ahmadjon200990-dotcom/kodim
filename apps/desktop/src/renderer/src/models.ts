// Ochiq fayllar modellari va avtosaqlash (diskka). Serverga sync main process'da har 5 soniyada.
import { isReadonlyPath, LARGE_INSERT_CHARS } from "@exam-ide/shared";
import { monaco } from "./monaco";

const SAVE_DELAY_MS = 400;

const models = new Map<string, monaco.editor.ITextModel>();
const pending = new Map<string, Promise<monaco.editor.ITextModel>>();
const timers = new Map<string, number>();
let errorListener: (message: string) => void = () => {};

/** Ichki paste / disk qayta yuklash paytida LARGE_INSERT yozilmasin. */
let internalEdits = 0;

export function onSaveError(listener: (message: string) => void): void {
  errorListener = listener;
}

/** editorClipboard ichki paste atrofida chaqiradi. */
export function runInternalEdit<T>(fn: () => T): T {
  internalEdits++;
  try {
    return fn();
  } finally {
    // O'zgarish hodisasi mikrotask'da keladi — bir tik kutamiz.
    queueMicrotask(() => internalEdits--);
  }
}

const uriOf = (path: string) => monaco.Uri.from({ scheme: "file", path: `/ish/${path}` });

export function openModel(path: string): Promise<monaco.editor.ITextModel> {
  const existing = models.get(path);
  if (existing) return Promise.resolve(existing);
  let promise = pending.get(path);
  if (!promise) {
    promise = window.kodim.fs.read(path).then((content) => {
      const model = monaco.editor.getModel(uriOf(path)) ?? monaco.editor.createModel(content, undefined, uriOf(path));
      if (!isReadonlyPath(path)) {
        model.onDidChangeContent((e) => {
          schedule(path);
          detectLargeInsert(e);
        });
      }
      models.set(path, model);
      pending.delete(path);
      return model;
    });
    promise.catch(() => pending.delete(path));
    pending.set(path, promise);
  }
  return promise;
}

/** Bitta o'zgarishda >200 belgi qo'shilsa va u ichki paste/tiklash emas — LARGE_INSERT. */
function detectLargeInsert(e: monaco.editor.IModelContentChangedEvent): void {
  if (internalEdits > 0 || e.isUndoing || e.isRedoing || e.isFlush) return;
  let net = 0;
  for (const c of e.changes) net += c.text.length - c.rangeLength;
  if (net > LARGE_INSERT_CHARS) window.kodim.reportLargeInsert(net);
}

/** Diskda o'zgargan faylni (tashqi yoki tiklangan) editor modeliga yuklaydi. */
export async function reloadFromDisk(path: string): Promise<void> {
  const model = models.get(path);
  if (!model) return;
  const content = await window.kodim.fs.read(path).catch(() => null);
  if (content === null || content === model.getValue()) return;
  runInternalEdit(() => model.setValue(content));
}

function schedule(path: string): void {
  window.clearTimeout(timers.get(path));
  timers.set(path, window.setTimeout(() => void save(path), SAVE_DELAY_MS));
}

export async function save(path: string): Promise<void> {
  window.clearTimeout(timers.get(path));
  timers.delete(path);
  const model = models.get(path);
  if (!model || isReadonlyPath(path)) return;
  const res = await window.kodim.fs.write(path, model.getValue());
  if (!res.ok) errorListener(res.error);
}

export async function saveAll(): Promise<void> {
  await Promise.all([...timers.keys()].map((p) => save(p)));
}

/** Tabni yopish: avval saqlanadi. */
export async function closeModel(path: string): Promise<void> {
  await save(path);
  models.get(path)?.dispose();
  models.delete(path);
}

/** O'chirilgan/qayta nomlangan fayl yoki papka modellari saqlanmasdan yopiladi. */
export function discardUnder(path: string): void {
  for (const p of [...models.keys()]) {
    if (p === path || p.startsWith(`${path}/`)) {
      window.clearTimeout(timers.get(p));
      timers.delete(p);
      models.get(p)?.dispose();
      models.delete(p);
    }
  }
}

export function disposeAll(): void {
  for (const p of [...models.keys()]) discardUnder(p);
}
