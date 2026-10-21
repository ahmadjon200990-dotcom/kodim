import {
  FIGMA_LIMITS,
  figmaColor,
  parseFigmaUrl,
  type FigmaAutoLayout,
  type FigmaDesign,
  type FigmaEffect,
  type FigmaFrame,
  type FigmaLayer,
  type FigmaPaint,
  type FigmaText,
} from "@exam-ide/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { decryptSecret } from "../lib/crypto.js";

// Figma REST API (CLAUDE.md 0.8.1). O'qituvchining Personal Access Token'i bilan dizayn daraxti va freym
// rasmlari olinadi va bazada keshlanadi — Figma'ning rate limit'lari qattiq (ayniqsa View/Collab o'rinlar uchun),
// shuning uchun bitta havola uchun 2 ta asosiy so'rov: fayl/tugunlar + rasmlar. Token klientga hech qachon bormaydi.

export type FigmaErrorCode =
  | "NO_TOKEN"
  | "BAD_TOKEN"
  | "BAD_LINK"
  | "NOT_FOUND"
  | "NOT_SHARED"
  | "RATE_LIMIT"
  | "EMPTY"
  | "NETWORK";

export const FIGMA_ERROR_TEXT: Record<FigmaErrorCode, string> = {
  NO_TOKEN: "Figma tokeni saqlanmagan. Sozlamalar sahifasida Figma tokenini kiriting.",
  BAD_TOKEN: "Figma tokeni noto'g'ri yoki muddati o'tgan. Sozlamalarda yangi token kiriting.",
  BAD_LINK: "Figma havolasi noto'g'ri. figma.com/design/... yoki figma.com/file/... havolasini kiriting.",
  NOT_FOUND: "Figma fayli topilmadi. Havolani tekshiring yoki fayl o'chirilgan bo'lishi mumkin.",
  NOT_SHARED: "Bu fayl token egasiga ulashilmagan. Faylni Figma akkauntingizga ulashing (Share → can view).",
  RATE_LIMIT: "Figma API so'rovlar limiti tugadi. Bir necha daqiqadan so'ng \"Yangilash\" ni bosing.",
  EMPTY: "Havolada freym topilmadi. Freym (Frame) tanlangan havola yuboring.",
  NETWORK: "Figma serveriga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.",
};

export class FigmaError extends Error {
  constructor(
    readonly code: FigmaErrorCode,
    readonly retryAfterSec?: number,
  ) {
    super(FIGMA_ERROR_TEXT[code]);
  }
}

// ---------- Figma API javobining kerakli qismi ----------

interface RawColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}
interface RawPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: RawColor;
  gradientStops?: { position: number; color: RawColor }[];
  scaleMode?: string;
}
interface RawEffect {
  type: string;
  visible?: boolean;
  color?: RawColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}
interface RawNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: RawNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  rotation?: number;
  opacity?: number;
  blendMode?: string;
  clipsContent?: boolean;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  fills?: RawPaint[];
  strokes?: RawPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  effects?: RawEffect[];
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutWrap?: string;
  characters?: string;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    italic?: boolean;
    letterSpacing?: number;
    lineHeightPx?: number;
    lineHeightPercentFontSize?: number;
    lineHeightUnit?: string;
    textAlignHorizontal?: string;
    textCase?: string;
    textDecoration?: string;
  };
}

// ---------- HTTP ----------

async function figmaGet<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.FIGMA_API_BASE}${path}`, {
      headers: { "X-Figma-Token": token },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new FigmaError("NETWORK");
  }
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { err?: string; message?: string };
  const msg = `${body.err ?? ""} ${body.message ?? ""}`.toLowerCase();
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    throw new FigmaError("RATE_LIMIT", Number.isFinite(retry) ? retry : undefined);
  }
  if (res.status === 403 && /token|unauthori[sz]ed|expired/.test(msg)) throw new FigmaError("BAD_TOKEN");
  if (res.status === 401) throw new FigmaError("BAD_TOKEN");
  if (res.status === 404) throw new FigmaError("NOT_FOUND");
  if (res.status === 403) throw new FigmaError("NOT_SHARED");
  if (res.status === 400) throw new FigmaError("BAD_LINK");
  throw new FigmaError("NETWORK");
}

async function download(url: string): Promise<Buffer> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(String(res.status));
    return Buffer.from(await res.arrayBuffer());
  } catch {
    throw new FigmaError("NETWORK");
  }
}

/** Token haqiqiyligini tekshiradi; Figma foydalanuvchi nomini qaytaradi. */
export async function verifyFigmaToken(token: string): Promise<{ handle: string; email: string }> {
  const me = await figmaGet<{ handle?: string; email?: string }>("/v1/me", token);
  return { handle: me.handle ?? "", email: me.email ?? "" };
}

// ---------- Daraxtni soddalashtirish ----------

const round = (n: number) => Math.round(n * 100) / 100;

function paints(list: RawPaint[] | undefined): FigmaPaint[] | undefined {
  const out: FigmaPaint[] = [];
  for (const p of list ?? []) {
    if (p.visible === false) continue;
    const opacity = p.opacity ?? 1;
    const type = (
      ["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND", "IMAGE"].includes(p.type)
        ? p.type
        : "OTHER"
    ) as FigmaPaint["type"];
    out.push({
      type,
      ...(p.color && { color: figmaColor(p.color, opacity) }),
      ...(p.gradientStops && {
        stops: p.gradientStops.map((s) => ({ position: round(s.position), color: figmaColor(s.color, opacity) })),
      }),
      ...(opacity !== 1 && { opacity: round(opacity) }),
      ...(p.scaleMode && { scaleMode: p.scaleMode }),
    });
  }
  return out.length ? out : undefined;
}

function effects(list: RawEffect[] | undefined): FigmaEffect[] | undefined {
  const out: FigmaEffect[] = [];
  for (const e of list ?? []) {
    if (e.visible === false) continue;
    if (!["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"].includes(e.type)) continue;
    out.push({
      type: e.type as FigmaEffect["type"],
      ...(e.color && { color: figmaColor(e.color) }),
      ...(e.offset && { x: round(e.offset.x), y: round(e.offset.y) }),
      radius: round(e.radius ?? 0),
      ...(e.spread !== undefined && { spread: round(e.spread) }),
    });
  }
  return out.length ? out : undefined;
}

function layout(n: RawNode): FigmaAutoLayout | undefined {
  if (!n.layoutMode || n.layoutMode === "NONE") return undefined;
  return {
    mode: n.layoutMode as FigmaAutoLayout["mode"],
    gap: round(n.itemSpacing ?? 0),
    padding: [round(n.paddingTop ?? 0), round(n.paddingRight ?? 0), round(n.paddingBottom ?? 0), round(n.paddingLeft ?? 0)],
    ...(n.primaryAxisAlignItems && { primaryAlign: n.primaryAxisAlignItems }),
    ...(n.counterAxisAlignItems && { counterAlign: n.counterAxisAlignItems }),
    ...(n.layoutWrap === "WRAP" && { wrap: true }),
  };
}

function text(n: RawNode): FigmaText | undefined {
  if (n.type !== "TEXT") return undefined;
  const s = n.style ?? {};
  return {
    content: (n.characters ?? "").slice(0, 5000),
    ...(s.fontFamily && { fontFamily: s.fontFamily }),
    ...(s.fontWeight && { fontWeight: s.fontWeight }),
    ...(s.fontSize && { fontSize: round(s.fontSize) }),
    ...(s.italic && { italic: true }),
    ...(s.lineHeightUnit !== "INTRINSIC_%" && s.lineHeightPx && { lineHeightPx: round(s.lineHeightPx) }),
    ...(s.lineHeightPercentFontSize && { lineHeightPercent: round(s.lineHeightPercentFontSize) }),
    ...(s.letterSpacing && { letterSpacing: round(s.letterSpacing) }),
    ...(s.textAlignHorizontal && { textAlign: s.textAlignHorizontal }),
    ...(s.textCase && s.textCase !== "ORIGINAL" && { textCase: s.textCase }),
    ...(s.textDecoration && s.textDecoration !== "NONE" && { textDecoration: s.textDecoration }),
  };
}

/** Freym daraxtini tekis qatlamlar ro'yxatiga aylantiradi (koordinatalar freymga nisbatan). */
export function flattenFrame(frame: RawNode, page: string): FigmaFrame {
  const box = frame.absoluteBoundingBox ?? { x: 0, y: 0, width: 0, height: 0 };
  const layers: FigmaLayer[] = [];
  const walk = (n: RawNode, parent: number, depth: number) => {
    if (n.visible === false || layers.length >= FIGMA_LIMITS.maxLayersPerFrame) return;
    const b = n.absoluteBoundingBox;
    if (!b) return;
    const radius =
      n.rectangleCornerRadii && new Set(n.rectangleCornerRadii).size > 1
        ? (n.rectangleCornerRadii.map(round) as [number, number, number, number])
        : n.cornerRadius
          ? round(n.cornerRadius)
          : undefined;
    const strokes = paints(n.strokes);
    const layer: FigmaLayer = {
      id: n.id,
      name: n.name.slice(0, 200),
      type: n.type,
      parent,
      depth,
      x: round(b.x - box.x),
      y: round(b.y - box.y),
      w: round(b.width),
      h: round(b.height),
      visible: true,
      ...(n.rotation && Math.abs(n.rotation) > 0.001 && { rotation: round((n.rotation * 180) / Math.PI) }),
      ...(n.opacity !== undefined && n.opacity < 1 && { opacity: round(n.opacity) }),
      ...(radius !== undefined && { radius }),
      ...(paints(n.fills) && { fills: paints(n.fills) }),
      ...(strokes && { strokes, strokeWeight: round(n.strokeWeight ?? 1), ...(n.strokeAlign && { strokeAlign: n.strokeAlign }) }),
      ...(effects(n.effects) && { effects: effects(n.effects) }),
      ...(layout(n) && { layout: layout(n) }),
      ...(text(n) && { text: text(n) }),
      ...(n.blendMode && !["PASS_THROUGH", "NORMAL"].includes(n.blendMode) && { blendMode: n.blendMode }),
      ...(n.clipsContent && { clips: true }),
    };
    const index = layers.push(layer) - 1;
    for (const c of n.children ?? []) walk(c, index, depth + 1);
  };
  walk(frame, -1, 0);
  return { id: frame.id, name: frame.name, page, width: round(box.width), height: round(box.height), image: null, scale: 2, layers };
}

const FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "GROUP"]);

/** Sahifa yoki bo'limdan (SECTION) yuqori darajadagi freymlarni yig'adi. */
function collectFrames(node: RawNode, page: string, out: { node: RawNode; page: string }[]): void {
  for (const c of node.children ?? []) {
    if (out.length >= FIGMA_LIMITS.maxFrames) return;
    if (c.visible === false) continue;
    if (c.type === "SECTION") collectFrames(c, page, out);
    else if (FRAME_TYPES.has(c.type) && c.absoluteBoundingBox) out.push({ node: c, page });
  }
}

export interface FetchedDesign {
  design: FigmaDesign;
  images: { frameId: string; format: "png"; scale: number; bytes: Buffer }[];
}

/** Havoladagi dizaynni oladi: freymlar, qatlamlar va PNG rasmlar. */
export async function fetchFigmaDesign(url: string, token: string): Promise<FetchedDesign> {
  const link = parseFigmaUrl(url);
  if (!link) throw new FigmaError("BAD_LINK");

  const picked: { node: RawNode; page: string }[] = [];
  let fileName = "";
  if (link.nodeId) {
    const res = await figmaGet<{ name: string; nodes: Record<string, { document: RawNode } | null> }>(
      `/v1/files/${link.fileKey}/nodes?ids=${encodeURIComponent(link.nodeId)}`,
      token,
    );
    fileName = res.name;
    const doc = res.nodes[link.nodeId]?.document;
    if (!doc) throw new FigmaError("NOT_FOUND");
    if (doc.type === "CANVAS" || doc.type === "SECTION") collectFrames(doc, doc.name, picked);
    else if (doc.absoluteBoundingBox) picked.push({ node: doc, page: "" });
  } else {
    const res = await figmaGet<{ name: string; document: RawNode }>(`/v1/files/${link.fileKey}`, token);
    fileName = res.name;
    for (const page of res.document.children ?? []) collectFrames(page, page.name, picked);
  }
  if (picked.length === 0) throw new FigmaError("EMPTY");

  const frames = picked.map(({ node, page }) => flattenFrame(node, page));

  // Rasmlar: kichik freymlar 2x, katta (2x da 8 mln pikseldan ortiq) — 1x. Masshtab bo'yicha bitta so'rov.
  const byScale = new Map<number, FigmaFrame[]>();
  for (const f of frames) {
    const big = f.width * 2 * (f.height * 2) > 8_000_000 || Math.max(f.width, f.height) * 2 > FIGMA_LIMITS.maxImageSide;
    f.scale = big ? 1 : 2;
    byScale.set(f.scale, [...(byScale.get(f.scale) ?? []), f]);
  }
  const images: FetchedDesign["images"] = [];
  let total = 0;
  for (const [scale, group] of byScale) {
    const ids = group.map((f) => f.id).join(",");
    const res = await figmaGet<{ err?: string | null; images: Record<string, string | null> }>(
      `/v1/images/${link.fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=${scale}`,
      token,
    );
    for (const f of group) {
      const src = res.images[f.id];
      if (!src) continue;
      const bytes = await download(src);
      // Bitta fayl 6 MB va imtihon jami 14 MB dan oshmasin (o'quvchilarga yuboriladi).
      if (bytes.length > 6 * 1024 * 1024 || total + bytes.length > FIGMA_LIMITS.maxTotalImageBytes) continue;
      total += bytes.length;
      images.push({ frameId: f.id, format: "png", scale, bytes });
    }
  }

  return {
    design: { version: 1, fileKey: link.fileKey, fileName, url, fetchedAt: new Date().toISOString(), frames },
    images,
  };
}

// ---------- Kesh (baza) ----------

export async function teacherFigmaToken(teacherId: string): Promise<string | null> {
  const t = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { figmaToken: true } });
  return t?.figmaToken ? decryptSecret(t.figmaToken) : null;
}

const inflight = new Map<string, Promise<void>>();

/** Bitta havolani yangilaydi (xatoni keshga yozadi, tashlamaydi). */
export function refreshFigma(teacherId: string, url: string): Promise<void> {
  const key = `${teacherId} ${url}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const cache = await prisma.figmaCache.upsert({
      where: { teacherId_url: { teacherId, url } },
      create: { teacherId, url, status: "PENDING" },
      update: { status: "PENDING", error: null },
    });
    try {
      const token = await teacherFigmaToken(teacherId);
      if (!token) throw new FigmaError("NO_TOKEN");
      const { design, images } = await fetchFigmaDesign(url, token);
      await prisma.$transaction([
        prisma.figmaImage.deleteMany({ where: { cacheId: cache.id } }),
        ...images.map((img) =>
          prisma.figmaImage.create({
            data: { cacheId: cache.id, frameId: img.frameId, format: img.format, scale: img.scale, bytes: new Uint8Array(img.bytes) },
          }),
        ),
        prisma.figmaCache.update({
          where: { id: cache.id },
          data: { status: "READY", error: null, data: design as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
        }),
      ]);
    } catch (err) {
      const code: FigmaErrorCode = err instanceof FigmaError ? err.code : "NETWORK";
      // Avval tayyor bo'lgan dizayn saqlanib qoladi — faqat xato belgisi qo'yiladi.
      await prisma.figmaCache.update({
        where: { id: cache.id },
        data: { status: cache.data ? "READY" : "ERROR", error: code },
      });
    } finally {
      examFilesCache.clear();
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

interface TaskLike {
  type: string;
  figmaUrl: string | null;
}

/** Imtihondagi Figma havolalari (takrorlanmasdan). */
export function examFigmaUrls(tasks: TaskLike[]): string[] {
  return [...new Set(tasks.filter((t) => t.type === "FIGMA" && t.figmaUrl).map((t) => t.figmaUrl!))];
}

/**
 * Imtihon uchun dizaynlarni tayyorlaydi. `force` — tayyorlarini ham qayta oladi ("Yangilash" tugmasi).
 * Aks holda faqat hali olinmagan yoki xatolilar olinadi (Figma limitlarini tejash).
 */
export async function ensureExamFigma(teacherId: string, tasks: TaskLike[], force = false): Promise<void> {
  const urls = examFigmaUrls(tasks);
  if (!urls.length) return;
  const existing = await prisma.figmaCache.findMany({ where: { teacherId, url: { in: urls } }, select: { url: true, status: true, error: true } });
  const ready = new Set(existing.filter((c) => c.status === "READY" && !c.error).map((c) => c.url));
  await Promise.all(urls.filter((u) => force || !ready.has(u)).map((u) => refreshFigma(teacherId, u)));
}

export interface FigmaStatus {
  url: string;
  status: "PENDING" | "READY" | "ERROR" | "MISSING";
  error: string | null;
  errorText: string | null;
  fileName: string | null;
  frames: { id: string; name: string; width: number; height: number; hasImage: boolean }[];
  fetchedAt: string | null;
  cacheId: string | null;
}

export async function examFigmaStatus(teacherId: string, tasks: TaskLike[]): Promise<FigmaStatus[]> {
  const urls = examFigmaUrls(tasks);
  const caches = await prisma.figmaCache.findMany({
    where: { teacherId, url: { in: urls } },
    include: { images: { select: { frameId: true } } },
  });
  return urls.map((url) => {
    const c = caches.find((x) => x.url === url);
    if (!c) return { url, status: "MISSING", error: null, errorText: null, fileName: null, frames: [], fetchedAt: null, cacheId: null };
    const design = c.data as unknown as FigmaDesign | null;
    const withImg = new Set(c.images.map((i) => i.frameId));
    return {
      url,
      status: c.status as FigmaStatus["status"],
      error: c.error,
      errorText: c.error ? (FIGMA_ERROR_TEXT[c.error as FigmaErrorCode] ?? c.error) : null,
      fileName: design?.fileName ?? null,
      frames: (design?.frames ?? []).map((f) => ({ id: f.id, name: f.name, width: f.width, height: f.height, hasImage: withImg.has(f.id) })),
      fetchedAt: c.fetchedAt?.toISOString() ?? null,
      cacheId: c.id,
    };
  });
}

/** O'quvchi papkasi uchun: havola → dizayn + rasmlar (faqat tayyorlari). */
export interface ReadyFigma {
  design: FigmaDesign;
  images: Map<string, { format: string; bytes: Buffer }>;
}

export async function loadReadyFigma(teacherId: string, tasks: TaskLike[]): Promise<Map<string, ReadyFigma>> {
  const urls = examFigmaUrls(tasks);
  const out = new Map<string, ReadyFigma>();
  if (!urls.length) return out;
  const caches = await prisma.figmaCache.findMany({
    where: { teacherId, url: { in: urls } },
    include: { images: true },
  });
  for (const c of caches) {
    if (!c.data) continue;
    out.set(c.url, {
      design: c.data as unknown as FigmaDesign,
      images: new Map(c.images.map((i) => [i.frameId, { format: i.format, bytes: Buffer.from(i.bytes) }])),
    });
  }
  return out;
}

/** Imtihonning faqat-o'qish fayllari (savollar.md, dizaynlar/) keshi — ko'p o'quvchi kirganda qayta hisoblanmasin. */
export const examFilesCache = new Map<string, { at: number; value: unknown }>();
