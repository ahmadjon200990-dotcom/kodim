// Sinov uchun soxta Figma REST API (haqiqiy token va internetsiz to'liq oqimni tekshirish).
// Ishga tushirish: `node apps/server/dist/dev/fake-figma.js` (port 8090), serverda FIGMA_API_BASE=http://127.0.0.1:8090.
// Token: figd_kodim_test_token_0000000000. Fayl kalitlari: TESTFILE0001 (ishlaydi), NOTSHARED001 (403), LIMITED00001 (429).
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

const PORT = Number(process.env.FAKE_FIGMA_PORT ?? 8090);
const TOKEN = "figd_kodim_test_token_0000000000";

type Rgb = { r: number; g: number; b: number; a?: number };
interface Node {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox: { x: number; y: number; width: number; height: number };
  children?: Node[];
  fills?: { type: string; color: Rgb; opacity?: number }[];
  strokes?: { type: string; color: Rgb }[];
  strokeWeight?: number;
  strokeAlign?: string;
  cornerRadius?: number;
  effects?: { type: string; color: Rgb; offset: { x: number; y: number }; radius: number; spread?: number; visible: boolean }[];
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  characters?: string;
  style?: Record<string, unknown>;
  opacity?: number;
}

const hex = (h: string): Rgb => ({
  r: parseInt(h.slice(1, 3), 16) / 255,
  g: parseInt(h.slice(3, 5), 16) / 255,
  b: parseInt(h.slice(5, 7), 16) / 255,
  a: 1,
});
const solid = (h: string, opacity?: number) => [{ type: "SOLID", color: hex(h), ...(opacity !== undefined && { opacity }) }];
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const text = (id: string, name: string, x: number, y: number, w: number, h: number, chars: string, size: number, weight: number, color: string): Node => ({
  id,
  name,
  type: "TEXT",
  absoluteBoundingBox: box(x, y, w, h),
  fills: solid(color),
  characters: chars,
  style: { fontFamily: "Inter", fontWeight: weight, fontSize: size, lineHeightPx: Math.round(size * 1.4), lineHeightUnit: "PIXELS", letterSpacing: 0, textAlignHorizontal: "LEFT" },
});

// Ikkita freym: kartochka (desktop) va mobil sarlavha. Koordinatalar Figma kanvasida (absolute).
const card: Node = {
  id: "1:2",
  name: "Profil kartasi",
  type: "FRAME",
  absoluteBoundingBox: box(100, 100, 480, 560),
  fills: solid("#F1F5F9"),
  children: [
    {
      id: "1:3",
      name: "Card",
      type: "FRAME",
      absoluteBoundingBox: box(140, 140, 400, 480),
      fills: solid("#FFFFFF"),
      cornerRadius: 16,
      strokes: [{ type: "SOLID", color: hex("#E2E8F0") }],
      strokeWeight: 1,
      strokeAlign: "INSIDE",
      effects: [{ type: "DROP_SHADOW", color: { r: 0.06, g: 0.09, b: 0.16, a: 0.12 }, offset: { x: 0, y: 8 }, radius: 24, spread: 0, visible: true }],
      layoutMode: "VERTICAL",
      itemSpacing: 16,
      paddingTop: 32,
      paddingRight: 32,
      paddingBottom: 32,
      paddingLeft: 32,
      counterAxisAlignItems: "CENTER",
      children: [
        { id: "1:4", name: "Avatar", type: "ELLIPSE", absoluteBoundingBox: box(292, 172, 96, 96), fills: solid("#6366F1") },
        text("1:5", "Ism", 172, 284, 336, 34, "Ali Valiyev", 24, 700, "#0F172A"),
        text("1:6", "Kasb", 172, 334, 336, 22, "Frontend dasturchi", 16, 400, "#64748B"),
        text("1:7", "Tavsif", 172, 372, 336, 66, "HTML, CSS va React bilan zamonaviy veb-sahifalar yarataman.", 14, 400, "#334155"),
        {
          id: "1:8",
          name: "Tugma",
          type: "FRAME",
          absoluteBoundingBox: box(264, 470, 152, 48),
          fills: solid("#2563EB"),
          cornerRadius: 8,
          layoutMode: "HORIZONTAL",
          itemSpacing: 8,
          paddingTop: 12,
          paddingRight: 24,
          paddingBottom: 12,
          paddingLeft: 24,
          primaryAxisAlignItems: "CENTER",
          counterAxisAlignItems: "CENTER",
          children: [text("1:9", "Bog'lanish", 288, 482, 104, 24, "Bog'lanish", 16, 600, "#FFFFFF")],
        },
        { id: "1:10", name: "Chiziq", type: "RECTANGLE", absoluteBoundingBox: box(172, 550, 336, 1), fills: solid("#E2E8F0") },
        text("1:11", "Email", 172, 566, 336, 20, "ali@example.uz", 14, 500, "#2563EB"),
      ],
    },
  ],
};

const mobile: Node = {
  id: "2:1",
  name: "Mobil sarlavha",
  type: "FRAME",
  absoluteBoundingBox: box(700, 100, 375, 240),
  fills: solid("#0F172A"),
  children: [
    text("2:2", "Logo", 724, 124, 120, 28, "Kodim", 20, 800, "#FFFFFF"),
    { id: "2:3", name: "Menyu", type: "RECTANGLE", absoluteBoundingBox: box(1027, 128, 24, 20), fills: solid("#94A3B8"), cornerRadius: 2 },
    text("2:4", "Sarlavha", 724, 180, 327, 68, "Har bir qator — o'zingniki.", 28, 700, "#F8FAFC"),
    { id: "2:5", name: "CTA", type: "RECTANGLE", absoluteBoundingBox: box(724, 268, 160, 44), fills: solid("#22C55E"), cornerRadius: 22 },
  ],
};

const FILE = {
  name: "Kodim sinov dizayni",
  document: { id: "0:0", name: "Document", type: "DOCUMENT", children: [{ id: "0:1", name: "1-sahifa", type: "CANVAS", children: [card, mobile] }] },
};

const all = new Map<string, Node>();
const index = (n: Node) => {
  all.set(n.id, n);
  n.children?.forEach(index);
};
[card, mobile].forEach(index);

// ---------- PNG chizish (soddalashtirilgan: to'rtburchaklar va ellipslar rangi bilan) ----------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function renderPng(frame: Node, scale: number): Buffer {
  const fb = frame.absoluteBoundingBox;
  const W = Math.round(fb.width * scale);
  const H = Math.round(fb.height * scale);
  const px = Buffer.alloc(W * H * 3, 255);
  const paint = (n: Node) => {
    const f = n.fills?.[0];
    if (f) {
      const b = n.absoluteBoundingBox;
      const x0 = Math.round((b.x - fb.x) * scale);
      const y0 = Math.round((b.y - fb.y) * scale);
      const w = Math.max(1, Math.round(b.width * scale));
      const h = Math.max(1, Math.round(b.height * scale));
      const r = n.type === "TEXT" ? 0 : (n.cornerRadius ?? 0) * scale;
      for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
        for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
          const lx = x - x0;
          const ly = y - y0;
          if (n.type === "ELLIPSE") {
            const dx = (lx - w / 2) / (w / 2);
            const dy = (ly - h / 2) / (h / 2);
            if (dx * dx + dy * dy > 1) continue;
          } else if (r > 0) {
            const cx = lx < r ? r : lx > w - r ? w - r : lx;
            const cy = ly < r ? r : ly > h - r ? h - r : ly;
            if ((lx - cx) ** 2 + (ly - cy) ** 2 > r * r) continue;
          }
          // Matn — ingichka chiziqlar (shrift chizilmaydi).
          if (n.type === "TEXT" && Math.floor(ly / (3 * scale)) % 2 === 1) continue;
          const i = (y * W + x) * 3;
          px[i] = Math.round(f.color.r * 255);
          px[i + 1] = Math.round(f.color.g * 255);
          px[i + 2] = Math.round(f.color.b * 255);
        }
      }
    }
    n.children?.forEach(paint);
  };
  paint(frame);
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- HTTP ----------
const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  console.log(req.method, url.pathname + url.search);
  const img = /^\/img\/([\d:]+)@(\d)\.png$/.exec(decodeURIComponent(url.pathname));
  if (img) {
    const node = all.get(img[1]!);
    if (!node) return json(res, 404, { err: "not found" });
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(renderPng(node, Number(img[2])));
  }
  if (req.headers["x-figma-token"] !== TOKEN) return json(res, 403, { status: 403, err: "Invalid token" });
  if (url.pathname === "/v1/me") return json(res, 200, { id: "1", handle: "Kodim Sinov", email: "figma@kodim.uz" });
  const m = /^\/v1\/(files|images)\/([A-Za-z0-9]+)(\/nodes)?$/.exec(url.pathname);
  if (!m) return json(res, 404, { status: 404, err: "Not found" });
  const key = m[2];
  if (key === "NOTSHARED001") return json(res, 403, { status: 403, err: "Forbidden" });
  if (key === "LIMITED00001") {
    res.setHeader("retry-after", "60");
    return json(res, 429, { status: 429, err: "Rate limit exceeded" });
  }
  if (key !== "TESTFILE0001") return json(res, 404, { status: 404, err: "Not found" });
  if (m[1] === "images") {
    const scale = Number(url.searchParams.get("scale") ?? 1);
    const ids = (url.searchParams.get("ids") ?? "").split(",");
    return json(res, 200, { err: null, images: Object.fromEntries(ids.map((id) => [id, all.has(id) ? `http://127.0.0.1:${PORT}/img/${encodeURIComponent(id)}@${scale}.png` : null])) });
  }
  if (m[3]) {
    const ids = (url.searchParams.get("ids") ?? "").split(",");
    const page = FILE.document.children[0]!;
    return json(res, 200, {
      name: FILE.name,
      nodes: Object.fromEntries(ids.map((id) => [id, id === page.id ? { document: page } : all.has(id) ? { document: all.get(id) } : null])),
    });
  }
  return json(res, 200, FILE);
}).listen(PORT, "127.0.0.1", () => console.log(`Soxta Figma API: http://127.0.0.1:${PORT}`));
