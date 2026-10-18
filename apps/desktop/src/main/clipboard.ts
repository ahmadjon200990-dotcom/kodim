import { clipboard } from "electron";
import { sha1 } from "./workspace";

// CLAUDE.md 5.4: ilovaning o'z ichki clipboard'i. Ilova tizim clipboard'iga HECH QACHON yozmaydi
// (faqat imtihon boshlanganda bir marta tozalaydi) — shuning uchun tizim clipboard'idagi har qanday matn tashqaridan.

export type PasteSource = "editor" | "input" | "terminal" | "browser";

const MAX_INTERNAL = 5_000_000;

let internal = "";
let cleared = false;
/** Har bir tashqi matn bir marta xabar qilinadi (shovqin bo'lmasin). */
const reported = new Set<string>();

export function writeInternal(text: string): void {
  internal = text.slice(0, MAX_INTERNAL);
}

/**
 * Ichki clipboard matnini qaytaradi. Tizim clipboard'ida boshqa matn bo'lsa — tashqaridan paste urinishi:
 * `report` chaqiriladi (matnning o'zi emas, faqat uzunligi — shaxsiy ma'lumot o'qituvchiga ketmasin).
 */
export async function pasteInternal(
  source: PasteSource,
  report: (details: { source: PasteSource; length: number }) => void,
): Promise<string> {
  const external = await clipboard.readText().catch(() => "");
  if (external && external !== internal) {
    const key = sha1(external);
    if (!reported.has(key)) {
      reported.add(key);
      report({ source, length: external.length });
    }
  }
  return internal;
}

/** Imtihon boshlanganda bir marta. */
export function clearSystemClipboardOnce(): void {
  if (cleared) return;
  cleared = true;
  clipboard.clear();
}
