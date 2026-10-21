// Figma dizaynlarini login'siz ko'rish (CLAUDE.md 0.8.1): server Figma REST API'dan freymlar va qatlamlarni
// oladi, o'quvchining `dizaynlar/<n>-<slug>/figma/` papkasiga `design.json` + freym rasmlari (PNG 2x) tushadi.

/** Figma havolasidan fayl kaliti va (bo'lsa) tugun ID si. `node-id=1-2` → `1:2`. */
export interface FigmaLink {
  fileKey: string;
  nodeId: string | null;
}

export function parseFigmaUrl(raw: string): FigmaLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !/(^|\.)figma\.com$/i.test(u.hostname)) return null;
  // /file/<key>/..., /design/<key>/..., /proto/<key>/..., /board/<key> (FigJam emas — lekin kalit bir xil)
  const m = /^\/(?:file|design|proto|board)\/([A-Za-z0-9]{10,64})(?:\/|$)/.exec(u.pathname);
  if (!m?.[1]) return null;
  // Branch havolasi: /design/<key>/branch/<branchKey>/...
  const branch = /\/branch\/([A-Za-z0-9]{10,64})(?:\/|$)/.exec(u.pathname)?.[1];
  const node = u.searchParams.get("node-id");
  const nodeId = node && /^[0-9]+[-:][0-9]+$/.test(node) ? node.replace("-", ":") : null;
  return { fileKey: branch ?? m[1], nodeId };
}

/** O'quvchi papkasidagi joylashuv: `dizaynlar/<n>-<slug>/figma/design.json` va `.../figma/<i>-<nom>.png`. */
export const FIGMA_DIR = "figma";
export const FIGMA_DESIGN_FILE = "design.json";

export function isFigmaDesignFile(path: string): boolean {
  return path.endsWith(`/${FIGMA_DIR}/${FIGMA_DESIGN_FILE}`);
}

export interface FigmaColor {
  /** #RRGGBB yoki #RRGGBBAA (shaffoflik bo'lsa). */
  hex: string;
  /** rgba(r, g, b, a) */
  rgba: string;
}

export interface FigmaPaint {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND" | "IMAGE" | "OTHER";
  /** SOLID uchun. */
  color?: FigmaColor;
  /** Gradient to'xtash nuqtalari. */
  stops?: { position: number; color: FigmaColor }[];
  opacity?: number;
  /** IMAGE: to'ldirish usuli (FILL/FIT/CROP/TILE). */
  scaleMode?: string;
}

export interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  color?: FigmaColor;
  x?: number;
  y?: number;
  radius: number;
  spread?: number;
}

export interface FigmaText {
  content: string;
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  italic?: boolean;
  /** px; yo'q bo'lsa "auto". */
  lineHeightPx?: number;
  lineHeightPercent?: number;
  /** px */
  letterSpacing?: number;
  textAlign?: string;
  textCase?: string;
  textDecoration?: string;
}

export interface FigmaAutoLayout {
  mode: "HORIZONTAL" | "VERTICAL" | "GRID";
  gap: number;
  /** [top, right, bottom, left] */
  padding: [number, number, number, number];
  primaryAlign?: string;
  counterAlign?: string;
  wrap?: boolean;
}

export interface FigmaLayer {
  id: string;
  name: string;
  type: string;
  /** Ota qatlam indeksi (`layers` massivida), freymning o'zi — -1. */
  parent: number;
  depth: number;
  /** Freymning chap-yuqori burchagiga nisbatan (px). */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  visible: boolean;
  /** Bitta qiymat yoki [tl, tr, br, bl]. */
  radius?: number | [number, number, number, number];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  effects?: FigmaEffect[];
  layout?: FigmaAutoLayout;
  text?: FigmaText;
  blendMode?: string;
  clips?: boolean;
}

export interface FigmaFrame {
  id: string;
  name: string;
  page: string;
  width: number;
  height: number;
  /** Freym rasmi — ish papkasiga nisbatan yo'l (PNG, 2x yoki 1x). */
  image: string | null;
  /** Rasm masshtabi (1 yoki 2). */
  scale: number;
  /** `layers[0]` — freymning o'zi. */
  layers: FigmaLayer[];
}

export interface FigmaDesign {
  version: 1;
  fileKey: string;
  fileName: string;
  url: string;
  fetchedAt: string;
  frames: FigmaFrame[];
}

/** Eksport chegaralari (server): freymlar soni, qatlamlar soni, bitta imtihondagi PNG'lar jami. */
export const FIGMA_LIMITS = {
  maxFrames: 12,
  maxLayersPerFrame: 4000,
  maxTotalImageBytes: 14 * 1024 * 1024,
  /** 2x rasmning eng katta tomoni (px); undan katta freym 1x eksport qilinadi. */
  maxImageSide: 8192,
} as const;

/** Figma rang (0..1) → hex/rgba. */
export function figmaColor(c: { r: number; g: number; b: number; a?: number }, opacity = 1): FigmaColor {
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const r = to255(c.r);
  const g = to255(c.g);
  const b = to255(c.b);
  const a = Math.round(Math.max(0, Math.min(1, (c.a ?? 1) * opacity)) * 100) / 100;
  const hex2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  const hex = `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(Math.round(a * 255)) : ""}`;
  return { hex, rgba: `rgba(${r}, ${g}, ${b}, ${a})` };
}
