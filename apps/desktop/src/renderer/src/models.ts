// Ochiq fayllar modellari va avtosaqlash (diskka). Serverga sync main process'da har 5 soniyada.
import { isReadonlyPath, LARGE_INSERT_CHARS } from "@exam-ide/shared";
import { monaco } from "./monaco";

const SAVE_DELAY_MS = 400;

const models = new Map<string, monaco.editor.ITextModel>();
const pending = new Map<string, Promise<monaco.editor.ITextModel>>();
const timers = new Map<string, number>();
/**
 * Fayl bo'yicha diskdagi "bizniki" bo'lgan so'nggi matnlar (ochilganda o'qilgan va har saqlashda yozilgan).
 * Diskdan kelgan xabar shulardan biriga teng bo'lsa — bu o'z saqlashimiz, modelga TEGILMAYDI.
 */
const ownContents = new Map<string, string[]>();

function rememberOwn(path: string, content: string): void {
  const list = ownContents.get(path) ?? [];
  if (list[list.length - 1] === content) return;
  list.push(content);
  if (list.length > 20) list.shift();
  ownContents.set(path, list);
}
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
      rememberOwn(path, content);
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

/**
 * Diskda TASHQARIDAN o'zgargan faylni (terminal, tiklangan read-only fayl) editor modeliga yuklaydi.
 * O'z saqlashimiz e'tiborsiz. setValue ishlatilmaydi — faqat farq qilgan bo'lak almashtiriladi,
 * shuning uchun kursor va scroll joyida qoladi (o'zgarish kursordan oldin bo'lmasa).
 */
export async function reloadFromDisk(path: string): Promise<void> {
  const model = models.get(path);
  if (!model) return;
  const content = await window.kodim.fs.read(path).catch(() => null);
  if (content === null || model.isDisposed()) return;
  if (ownContents.get(path)?.includes(content)) return;
  const current = model.getValue();
  if (content === current) return;
  // Tashqi o'zgarish ustun: kutilayotgan avtosaqlash uni bosib ketmasin.
  window.clearTimeout(timers.get(path));
  timers.delete(path);
  rememberOwn(path, content);
  let start = 0;
  const max = Math.min(current.length, content.length);
  while (start < max && current[start] === content[start]) start++;
  let end = 0;
  while (end < max - start && current[current.length - 1 - end] === content[content.length - 1 - end]) end++;
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(current.length - end);
  runInternalEdit(() =>
    model.pushEditOperations(
      [],
      [{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: content.slice(start, content.length - end) }],
      () => null,
    ),
  );
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
  const value = model.getValue();
  rememberOwn(path, value);
  const res = await window.kodim.fs.write(path, value);
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
  ownContents.delete(path);
}

/** O'chirilgan/qayta nomlangan fayl yoki papka modellari saqlanmasdan yopiladi. */
export function discardUnder(path: string): void {
  for (const p of [...models.keys()]) {
    if (p === path || p.startsWith(`${path}/`)) {
      window.clearTimeout(timers.get(p));
      timers.delete(p);
      models.get(p)?.dispose();
      models.delete(p);
      ownContents.delete(p);
    }
  }
}

export function disposeAll(): void {
  for (const p of [...models.keys()]) discardUnder(p);
}
