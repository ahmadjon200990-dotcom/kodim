import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { FigmaColor, FigmaDesign, FigmaFrame, FigmaLayer, FigmaPaint } from "@exam-ide/shared";
import { uz } from "../uz";

// "Dizayn ko'rish" (CLAUDE.md 0.8.1): Figma Dev Mode'ga o'xshash inspect — freym rasmi ustida qatlamlarni
// ajratish, o'lcham/rang/shrift/oraliqlarni ko'rish va ichki clipboard'ga nusxalash. Login va internet kerak emas:
// ma'lumot `dizaynlar/<n>-<slug>/figma/design.json` da, rasmlar o'sha papkada.

interface Props {
  path: string;
  /** Figma havolasini ichki brauzerda (jonli) ochish. */
  onOpenLive(url: string): void;
}

interface View {
  zoom: number;
  x: number;
  y: number;
}

type Rect = { x: number; y: number; w: number; h: number };

const t = uz.design;

export function DesignView({ path, onOpenLive }: Props) {
  const [design, setDesign] = useState<FigmaDesign | null>(null);
  const [error, setError] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [colorMode, setColorMode] = useState<"hex" | "rgba">("hex");
  const [copied, setCopied] = useState<string | null>(null);
  const [showFrames, setShowFrames] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDesign(null);
    setError(false);
    void window.kodim.fs
      .read(path)
      .then((text) => {
        if (cancelled) return;
        const parsed = JSON.parse(text) as FigmaDesign;
        if (!Array.isArray(parsed.frames)) throw new Error("bad");
        setDesign(parsed);
        setFrameIndex(0);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const frame: FigmaFrame | null = design?.frames[frameIndex] ?? null;

  useEffect(() => {
    setImage(null);
    setHover(null);
    setSelected(null);
    if (!frame?.image) return;
    let cancelled = false;
    void window.kodim.fs
      .readImage(frame.image)
      .then((url) => !cancelled && setImage(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [frame]);

  /** Freymni oynaga moslash. */
  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !frame) return;
    const pad = 48;
    const zoom = Math.min(4, (stage.clientWidth - pad * 2) / frame.width, (stage.clientHeight - pad * 2) / frame.height);
    const z = Math.max(0.05, zoom);
    setView({ zoom: z, x: (stage.clientWidth - frame.width * z) / 2, y: Math.max(pad, (stage.clientHeight - frame.height * z) / 2) });
  }, [frame]);

  useEffect(() => {
    fit();
  }, [fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const px = cx ?? stage.clientWidth / 2;
    const py = cy ?? stage.clientHeight / 2;
    setView((v) => {
      const zoom = Math.max(0.05, Math.min(16, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  // Ctrl+g'ildirak — masshtab (kursor atrofida), oddiy g'ildirak — surish (pan).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
      else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [design]);

  /** Kursor ostidagi eng chuqur (eng kichik) ko'rinadigan qatlam. */
  const hitTest = useCallback(
    (fx: number, fy: number): number | null => {
      if (!frame) return null;
      let best: number | null = null;
      let bestArea = Infinity;
      let bestDepth = -1;
      frame.layers.forEach((l, i) => {
        if (i === 0) return;
        if (fx < l.x || fy < l.y || fx > l.x + l.w || fy > l.y + l.h) return;
        const area = Math.max(1, l.w * l.h);
        if (l.depth > bestDepth || (l.depth === bestDepth && area < bestArea)) {
          best = i;
          bestArea = area;
          bestDepth = l.depth;
        }
      });
      return best ?? (fx >= 0 && fy >= 0 && fx <= frame.width && fy <= frame.height ? 0 : null);
    },
    [frame],
  );

  const toFrame = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { fx: (e.clientX - r.left - view.x) / view.zoom, fy: (e.clientY - r.top - view.y) / view.zoom };
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMouseMove = (e: ReactMouseEvent) => {
    const d = drag.current;
    if (d && (e.buttons & 1 || e.buttons & 4)) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) {
        setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
        return;
      }
    }
    const { fx, fy } = toFrame(e);
    setHover(hitTest(fx, fy));
  };
  const onMouseUp = (e: ReactMouseEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved || e.button !== 0) return;
    const { fx, fy } = toFrame(e);
    setSelected(hitTest(fx, fy));
  };

  const copy = useCallback(async (label: string, value: string) => {
    await window.kodim.clipboard.write(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1200);
  }, []);

  // Esc — tanlovni bekor qilish; Ctrl+0 — moslash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!stageRef.current?.matches(":hover") && document.activeElement !== stageRef.current) return;
      if (e.key === "Escape") setSelected(null);
      else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        fit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit]);

  const sel = frame && selected !== null ? (frame.layers[selected] ?? null) : null;
  const hov = frame && hover !== null && hover !== selected ? (frame.layers[hover] ?? null) : null;
  const pages = useMemo(() => {
    const map = new Map<string, number[]>();
    design?.frames.forEach((f, i) => map.set(f.page || "", [...(map.get(f.page || "") ?? []), i]));
    return [...map.entries()];
  }, [design]);

  if (error) {
    return (
      <div className="editor-welcome">
        <div>{t.loadFailed}</div>
        <div className="muted small">{path}</div>
      </div>
    );
  }
  if (!design || !frame) return <div className="editor-welcome muted small">{uz.editor.loading}</div>;

  const z = view.zoom;
  const stroke = 1 / z;

  return (
    <div className="dv">
      <div className="dv-toolbar">
        <button className={showFrames ? "icon-btn icon-btn-on" : "icon-btn"} title={t.frames} onClick={() => setShowFrames((s) => !s)}>
          ▤
        </button>
        <span className="dv-title" title={design.fileName}>
          {design.fileName} <span className="dv-sep">/</span> <strong>{frame.name}</strong>
        </span>
        <span className="dv-dim">
          {fmt(frame.width)} × {fmt(frame.height)}
        </span>
        <span className="sb-spacer" />
        <span className="dv-hint">{t.hint}</span>
        <button className="icon-btn" title={uz.editor.zoomOut} onClick={() => zoomAt(1 / 1.25)}>
          −
        </button>
        <span className="image-zoom">{Math.round(z * 100)}%</span>
        <button className="icon-btn" title={uz.editor.zoomIn} onClick={() => zoomAt(1.25)}>
          +
        </button>
        <button
          className="icon-btn"
          title={uz.editor.zoomReal}
          onClick={() => {
            const stage = stageRef.current;
            setView({ zoom: 1, x: stage ? Math.max(24, (stage.clientWidth - frame.width) / 2) : 24, y: 24 });
          }}
        >
          1:1
        </button>
        <button className="icon-btn" title={`${uz.editor.zoomFit} (Ctrl+0)`} onClick={fit}>
          ⤢
        </button>
        <button className="dv-live" title={t.liveHint} onClick={() => onOpenLive(design.url)}>
          {t.live}
        </button>
      </div>
      <div className="dv-body">
        {showFrames && (
          <aside className="dv-frames">
            {pages.map(([page, idx]) => (
              <div key={page}>
                {page && <div className="dv-page">{page}</div>}
                {idx.map((i) => {
                  const f = design.frames[i]!;
                  return (
                    <button key={f.id} className={i === frameIndex ? "dv-frame dv-frame-on" : "dv-frame"} onClick={() => setFrameIndex(i)}>
                      <span className="dv-frame-icon">#</span>
                      <span className="dv-frame-name">{f.name}</span>
                      <span className="dv-frame-size">
                        {fmt(f.width)}×{fmt(f.height)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {sel && <LayerPath frame={frame} index={selected!} onPick={setSelected} />}
          </aside>
        )}
        <div
          ref={stageRef}
          className="dv-stage"
          tabIndex={0}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            setHover(null);
            drag.current = null;
          }}
          onDoubleClick={() => sel && sel.parent >= 0 && setSelected(sel.parent)}
        >
          <div
            className="dv-canvas"
            style={{ width: frame.width, height: frame.height, transform: `translate(${view.x}px, ${view.y}px) scale(${z})` }}
          >
            {image ? (
              <img className="dv-img" src={image} alt={frame.name} draggable={false} />
            ) : (
              <div className="dv-noimg">{frame.image ? uz.editor.loading : t.noImage}</div>
            )}
            <svg className="dv-overlay" width={frame.width} height={frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`}>
              {hov && <rect className="dv-hover" x={hov.x} y={hov.y} width={hov.w} height={hov.h} strokeWidth={stroke * 1.5} />}
              {sel && <rect className="dv-sel" x={sel.x} y={sel.y} width={sel.w} height={sel.h} strokeWidth={stroke * 2} />}
              {sel && hov && <Distances a={sel} b={hov} zoom={z} />}
            </svg>
            {sel && (
              <div className="dv-sizetag" style={{ left: sel.x + sel.w / 2, top: sel.y + sel.h, transform: `translate(-50%, ${6 / z}px) scale(${1 / z})` }}>
                {fmt(sel.w)} × {fmt(sel.h)}
              </div>
            )}
          </div>
        </div>
        <aside className="dv-inspect">
          {sel ? (
            <Inspect layer={sel} colorMode={colorMode} setColorMode={setColorMode} copy={copy} copied={copied} />
          ) : (
            <div className="dv-empty">
              <div className="dv-empty-title">{t.pickTitle}</div>
              <div className="muted small">{t.pickText}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Tanlangan qatlamning ota qatlamlari (yuqoriga chiqish uchun). */
function LayerPath({ frame, index, onPick }: { frame: FigmaFrame; index: number; onPick(i: number): void }) {
  const chain: number[] = [];
  for (let i: number = index; i >= 0; i = frame.layers[i]?.parent ?? -1) chain.unshift(i);
  return (
    <div className="dv-layers">
      <div className="dv-page">{t.layers}</div>
      {chain.map((i) => {
        const l = frame.layers[i]!;
        return (
          <button key={l.id} className={i === index ? "dv-frame dv-frame-on" : "dv-frame"} style={{ paddingLeft: 8 + l.depth * 10 }} onClick={() => onPick(i)}>
            <span className="dv-frame-icon">{typeIcon(l.type)}</span>
            <span className="dv-frame-name">{l.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ikki qatlam orasidagi masofalar (Figma'dagi Alt-hover kabi). */
function Distances({ a, b, zoom }: { a: Rect; b: Rect; zoom: number }) {
  const lines: { x1: number; y1: number; x2: number; y2: number; v: number }[] = [];
  const contains = (o: Rect, i: Rect) => i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
  const outer = contains(b, a) ? b : contains(a, b) ? a : null;
  if (outer) {
    const inner = outer === b ? a : b;
    const cx = inner.x + inner.w / 2;
    const cy = inner.y + inner.h / 2;
    lines.push({ x1: cx, y1: outer.y, x2: cx, y2: inner.y, v: inner.y - outer.y });
    lines.push({ x1: cx, y1: inner.y + inner.h, x2: cx, y2: outer.y + outer.h, v: outer.y + outer.h - inner.y - inner.h });
    lines.push({ x1: outer.x, y1: cy, x2: inner.x, y2: cy, v: inner.x - outer.x });
    lines.push({ x1: inner.x + inner.w, y1: cy, x2: outer.x + outer.w, y2: cy, v: outer.x + outer.w - inner.x - inner.w });
  } else {
    const midY = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2;
    const midX = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
    const ay = a.y + a.h / 2;
    const ax = a.x + a.w / 2;
    if (a.x + a.w <= b.x) lines.push({ x1: a.x + a.w, y1: overlapY(a, b) ? midY : ay, x2: b.x, y2: overlapY(a, b) ? midY : ay, v: b.x - a.x - a.w });
    else if (b.x + b.w <= a.x) lines.push({ x1: b.x + b.w, y1: overlapY(a, b) ? midY : ay, x2: a.x, y2: overlapY(a, b) ? midY : ay, v: a.x - b.x - b.w });
    if (a.y + a.h <= b.y) lines.push({ x1: overlapX(a, b) ? midX : ax, y1: a.y + a.h, x2: overlapX(a, b) ? midX : ax, y2: b.y, v: b.y - a.y - a.h });
    else if (b.y + b.h <= a.y) lines.push({ x1: overlapX(a, b) ? midX : ax, y1: b.y + b.h, x2: overlapX(a, b) ? midX : ax, y2: a.y, v: a.y - b.y - b.h });
  }
  const s = 1 / zoom;
  return (
    <g>
      {lines
        .filter((l) => l.v > 0.01)
        .map((l, i) => {
          const mx = (l.x1 + l.x2) / 2;
          const my = (l.y1 + l.y2) / 2;
          const label = fmt(l.v);
          const w = (label.length * 7 + 10) * s;
          return (
            <g key={i}>
              <line className="dv-dist" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={s} />
              <rect className="dv-dist-bg" x={mx - w / 2} y={my - 9 * s} width={w} height={18 * s} rx={3 * s} />
              <text className="dv-dist-text" x={mx} y={my + 4 * s} fontSize={11 * s} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
    </g>
  );
}

const overlapY = (a: Rect, b: Rect) => Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
const overlapX = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x);

interface InspectProps {
  layer: FigmaLayer;
  colorMode: "hex" | "rgba";
  setColorMode(m: "hex" | "rgba"): void;
  copy(label: string, value: string): Promise<void>;
  copied: string | null;
}

function Inspect({ layer: l, colorMode, setColorMode, copy, copied }: InspectProps) {
  const color = (c: FigmaColor) => (colorMode === "hex" ? c.hex : c.rgba);
  const css = useMemo(() => toCss(l), [l]);
  const paintRows = (list: FigmaPaint[], prefix: string) =>
    list.map((p, i) => {
      const label = list.length > 1 ? `${prefix} ${i + 1}` : prefix;
      if (p.type === "SOLID" && p.color) {
        return <CopyRow id={l.id} copy={copy} copied={copied} key={i} label={label} copyValue={color(p.color)} value={<Swatch c={p.color} text={color(p.color)} />} />;
      }
      if (p.stops) {
        const value = gradientCss(p);
        return <CopyRow id={l.id} copy={copy} copied={copied} key={i} label={label} copyValue={value} value={<span className="dv-mono">{t.paint[p.type] ?? p.type}</span>} />;
      }
      return <CopyRow id={l.id} copy={copy} copied={copied} key={i} label={label} value={t.paint[p.type] ?? p.type} />;
    });

  return (
    <div className="dv-props">
      <div className="dv-head">
        <span className="dv-type">{typeIcon(l.type)}</span>
        <span className="dv-name" title={l.name}>
          {l.name}
        </span>
        <div className="dv-modes">
          <button className={colorMode === "hex" ? "dv-mode dv-mode-on" : "dv-mode"} onClick={() => setColorMode("hex")}>
            HEX
          </button>
          <button className={colorMode === "rgba" ? "dv-mode dv-mode-on" : "dv-mode"} onClick={() => setColorMode("rgba")}>
            RGBA
          </button>
        </div>
      </div>

      <Section title={t.sections.position}>
        <div className="dv-grid">
          <CopyRow id={l.id} copy={copy} copied={copied} label="X" value={fmt(l.x)} />
          <CopyRow id={l.id} copy={copy} copied={copied} label="Y" value={fmt(l.y)} />
          <CopyRow id={l.id} copy={copy} copied={copied} label="W" value={fmt(l.w)} copyValue={`${fmt(l.w)}px`} />
          <CopyRow id={l.id} copy={copy} copied={copied} label="H" value={fmt(l.h)} copyValue={`${fmt(l.h)}px`} />
        </div>
        {l.rotation !== undefined && <CopyRow id={l.id} copy={copy} copied={copied} label={t.rotation} value={`${fmt(l.rotation)}°`} />}
      </Section>

      {l.layout && (
        <Section title={t.sections.layout}>
          <CopyRow id={l.id} copy={copy} copied={copied} label={t.direction} value={t.dir[l.layout.mode] ?? l.layout.mode} />
          <CopyRow id={l.id} copy={copy} copied={copied} label={t.gap} value={`${fmt(l.layout.gap)}px`} />
          <CopyRow id={l.id} copy={copy} copied={copied} label={t.padding} value={l.layout.padding.map((p) => `${fmt(p)}px`).join(" ")} />
          {l.layout.wrap && <CopyRow id={l.id} copy={copy} copied={copied} label={t.wrap} value="wrap" />}
        </Section>
      )}

      {(l.radius !== undefined || l.opacity !== undefined || l.blendMode) && (
        <Section title={t.sections.appearance}>
          {l.radius !== undefined && (
            <CopyRow id={l.id} copy={copy} copied={copied} label={t.radius} value={Array.isArray(l.radius) ? l.radius.map((r) => `${fmt(r)}px`).join(" ") : `${fmt(l.radius)}px`} />
          )}
          {l.opacity !== undefined && <CopyRow id={l.id} copy={copy} copied={copied} label={t.opacity} value={`${Math.round(l.opacity * 100)}%`} copyValue={String(l.opacity)} />}
          {l.blendMode && <CopyRow id={l.id} copy={copy} copied={copied} label={t.blend} value={l.blendMode.toLowerCase()} />}
        </Section>
      )}

      {l.text && (
        <Section title={t.sections.text}>
          {l.text.fontFamily && <CopyRow id={l.id} copy={copy} copied={copied} label={t.font} value={l.text.fontFamily} />}
          {l.text.fontWeight && <CopyRow id={l.id} copy={copy} copied={copied} label={t.weight} value={`${l.text.fontWeight}${weightName(l.text.fontWeight)}`} copyValue={String(l.text.fontWeight)} />}
          {l.text.fontSize && <CopyRow id={l.id} copy={copy} copied={copied} label={t.size} value={`${fmt(l.text.fontSize)}px`} />}
          <CopyRow id={l.id} copy={copy} copied={copied} label={t.lineHeight} value={l.text.lineHeightPx ? `${fmt(l.text.lineHeightPx)}px` : "auto"} />
          {l.text.letterSpacing !== undefined && <CopyRow id={l.id} copy={copy} copied={copied} label={t.letterSpacing} value={`${fmt(l.text.letterSpacing)}px`} />}
          {l.text.textAlign && <CopyRow id={l.id} copy={copy} copied={copied} label={t.align} value={l.text.textAlign.toLowerCase()} />}
          {l.text.italic && <CopyRow id={l.id} copy={copy} copied={copied} label={t.style} value="italic" />}
          {l.text.textCase && <CopyRow id={l.id} copy={copy} copied={copied} label={t.textCase} value={l.text.textCase.toLowerCase()} />}
          {l.text.textDecoration && <CopyRow id={l.id} copy={copy} copied={copied} label={t.decoration} value={l.text.textDecoration.toLowerCase()} />}
          <div className="dv-textcontent" title={t.clickToCopy} onClick={() => void copy(`${l.id}:content`, l.text!.content)}>
            {copied === `${l.id}:content` ? <span className="dv-copied">{t.copied}</span> : l.text.content}
          </div>
        </Section>
      )}

      {l.fills && <Section title={l.text ? t.sections.textColor : t.sections.fill}>{paintRows(l.fills, l.text ? t.color : t.fill)}</Section>}

      {l.strokes && (
        <Section title={t.sections.stroke}>
          {paintRows(l.strokes, t.color)}
          <CopyRow id={l.id} copy={copy} copied={copied} label={t.strokeWeight} value={`${fmt(l.strokeWeight ?? 1)}px`} />
          {l.strokeAlign && <CopyRow id={l.id} copy={copy} copied={copied} label={t.strokeAlign} value={t.strokeAligns[l.strokeAlign] ?? l.strokeAlign} />}
        </Section>
      )}

      {l.effects && (
        <Section title={t.sections.effects}>
          {l.effects.map((e, i) => {
            const shadow = e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW";
            const value = shadow
              ? `${e.type === "INNER_SHADOW" ? "inset " : ""}${fmt(e.x ?? 0)}px ${fmt(e.y ?? 0)}px ${fmt(e.radius)}px ${fmt(e.spread ?? 0)}px ${e.color ? color(e.color) : ""}`
              : `blur(${fmt(e.radius)}px)`;
            return <CopyRow id={l.id} copy={copy} copied={copied} key={i} label={t.effects[e.type] ?? e.type} value={<span className="dv-mono">{value}</span>} copyValue={value} />;
          })}
        </Section>
      )}

      <Section title="CSS">
        <pre className="dv-css" title={t.clickToCopy} onClick={() => void copy(`${l.id}:css`, css)}>
          {copied === `${l.id}:css` ? t.copied : css}
        </pre>
      </Section>
    </div>
  );
}

function CopyRow({
  id,
  label,
  value,
  copyValue,
  copy,
  copied,
}: {
  id: string;
  label: string;
  value: ReactNode;
  copyValue?: string;
  copy(label: string, value: string): Promise<void>;
  copied: string | null;
}) {
  const key = `${id}:${label}`;
  const text = copyValue ?? (typeof value === "string" || typeof value === "number" ? String(value) : "");
  return (
    <div className="dv-row" title={text ? t.clickToCopy : undefined} onClick={() => text && void copy(key, text)}>
      <span className="dv-label">{label}</span>
      <span className="dv-value">{copied === key ? <span className="dv-copied">{t.copied}</span> : value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dv-section">
      <div className="dv-section-title">{title}</div>
      {children}
    </div>
  );
}

function Swatch({ c, text }: { c: FigmaColor; text: string }) {
  return (
    <span className="dv-swatch-wrap">
      <span className="dv-swatch" style={{ background: c.rgba }} />
      <span className="dv-mono">{text}</span>
    </span>
  );
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function weightName(w: number): string {
  const names: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };
  return names[w] ? ` · ${names[w]}` : "";
}

function typeIcon(type: string): string {
  if (type === "TEXT") return "T";
  if (type === "ELLIPSE") return "○";
  if (type === "VECTOR" || type === "BOOLEAN_OPERATION" || type === "STAR" || type === "LINE" || type === "REGULAR_POLYGON") return "✎";
  if (type === "INSTANCE" || type === "COMPONENT" || type === "COMPONENT_SET") return "◇";
  if (type === "GROUP") return "▣";
  if (type === "RECTANGLE") return "□";
  return "#";
}

function gradientCss(p: FigmaPaint): string {
  const stops = (p.stops ?? []).map((s) => `${s.color.rgba} ${Math.round(s.position * 100)}%`).join(", ");
  return p.type === "GRADIENT_RADIAL" ? `radial-gradient(${stops})` : `linear-gradient(${stops})`;
}

const JUSTIFY: Record<string, string> = { MIN: "flex-start", CENTER: "center", MAX: "flex-end", SPACE_BETWEEN: "space-between" };
const ALIGN: Record<string, string> = { MIN: "flex-start", CENTER: "center", MAX: "flex-end", BASELINE: "baseline" };

/** Qatlam uchun taxminiy CSS (Figma Dev Mode kabi). */
export function toCss(l: FigmaLayer): string {
  const out: string[] = [];
  const px = (n: number) => `${fmt(n)}px`;
  if (!l.text) out.push(`width: ${px(l.w)};`, `height: ${px(l.h)};`);
  if (l.layout && l.layout.mode !== "GRID") {
    out.push("display: flex;");
    if (l.layout.mode === "VERTICAL") out.push("flex-direction: column;");
    if (l.layout.wrap) out.push("flex-wrap: wrap;");
    if (l.layout.primaryAlign && JUSTIFY[l.layout.primaryAlign]) out.push(`justify-content: ${JUSTIFY[l.layout.primaryAlign]};`);
    if (l.layout.counterAlign && ALIGN[l.layout.counterAlign]) out.push(`align-items: ${ALIGN[l.layout.counterAlign]};`);
    if (l.layout.gap) out.push(`gap: ${px(l.layout.gap)};`);
    const [t, r, b, lft] = l.layout.padding;
    if (t || r || b || lft) out.push(`padding: ${t === b && r === lft ? (t === r ? px(t) : `${px(t)} ${px(r)}`) : `${px(t)} ${px(r)} ${px(b)} ${px(lft)}`};`);
  }
  const fill = l.fills?.[0];
  if (fill) {
    const value = fill.type === "SOLID" && fill.color ? fill.color.hex : fill.stops ? gradientCss(fill) : null;
    if (value) out.push(l.text ? `color: ${value};` : `background: ${value};`);
  }
  if (l.strokes?.[0]?.color) out.push(`border: ${px(l.strokeWeight ?? 1)} solid ${l.strokes[0].color.hex};`);
  if (l.radius !== undefined) out.push(`border-radius: ${Array.isArray(l.radius) ? l.radius.map(px).join(" ") : px(l.radius)};`);
  const shadows = (l.effects ?? []).filter((e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW");
  if (shadows.length) {
    out.push(
      `box-shadow: ${shadows
        .map((e) => `${e.type === "INNER_SHADOW" ? "inset " : ""}${px(e.x ?? 0)} ${px(e.y ?? 0)} ${px(e.radius)} ${px(e.spread ?? 0)} ${e.color?.rgba ?? "rgba(0, 0, 0, 0.25)"}`)
        .join(", ")};`,
    );
  }
  const blur = l.effects?.find((e) => e.type === "LAYER_BLUR");
  if (blur) out.push(`filter: blur(${px(blur.radius)});`);
  if (l.opacity !== undefined) out.push(`opacity: ${l.opacity};`);
  if (l.text) {
    if (l.text.fontFamily) out.push(`font-family: "${l.text.fontFamily}", sans-serif;`);
    if (l.text.fontSize) out.push(`font-size: ${px(l.text.fontSize)};`);
    if (l.text.fontWeight) out.push(`font-weight: ${l.text.fontWeight};`);
    if (l.text.italic) out.push("font-style: italic;");
    if (l.text.lineHeightPx) out.push(`line-height: ${px(l.text.lineHeightPx)};`);
    if (l.text.letterSpacing) out.push(`letter-spacing: ${px(l.text.letterSpacing)};`);
    if (l.text.textAlign && l.text.textAlign !== "LEFT") out.push(`text-align: ${l.text.textAlign === "JUSTIFIED" ? "justify" : l.text.textAlign.toLowerCase()};`);
    if (l.text.textCase === "UPPER") out.push("text-transform: uppercase;");
    if (l.text.textCase === "LOWER") out.push("text-transform: lowercase;");
    if (l.text.textDecoration === "UNDERLINE") out.push("text-decoration: underline;");
    if (l.text.textDecoration === "STRIKETHROUGH") out.push("text-decoration: line-through;");
  }
  return out.join("\n");
}
