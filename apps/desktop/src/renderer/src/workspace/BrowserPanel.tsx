import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BrowserState } from "../../../common/api";
import { useDialogOpen } from "../Dialog";
import { uz } from "../uz";

interface Props {
  /** To'liq ekran (editor o'rnida) yoki yon panel. */
  full: boolean;
  onToggleFull(): void;
  onClose(): void;
  /** Figma sahifasi uchun ichki dizayn ko'rinishi fayli (bo'lsa). */
  inspectFor(url: string): string | null;
  onInspect(file: string): void;
}

/**
 * Ichki brauzer paneli. Sahifaning o'zi main process'dagi WebContentsView'da —
 * bu komponent faqat boshqaruv va view joylashadigan joyni (o'lchamini) beradi.
 */
export function BrowserPanel({ full, onToggleFull, onClose, inspectFor, onInspect }: Props) {
  const dialogOpen = useDialogOpen();
  const slotRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<BrowserState>({ url: "", title: "", canGoBack: false, canGoForward: false, loading: false });
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => window.kodim.browser.onState(setState), []);

  useEffect(() => {
    if (!editing) setAddress(state.url === "about:blank" ? "" : state.url);
  }, [state.url, editing]);

  // View o'lchamini panel joyiga moslash; modal oyna ochiq bo'lsa yashiriladi (view DOM ustida turadi).
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      window.kodim.browser.setBounds(dialogOpen || r.width < 10 ? null : { x: r.x, y: r.y, width: r.width, height: r.height });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [dialogOpen]);

  useEffect(() => () => window.kodim.browser.setBounds(null), []);

  const inspect = state.url ? inspectFor(state.url) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setEditing(false);
    if (!address.trim()) return;
    const res = await window.kodim.browser.navigate(address);
    setError(res.ok ? "" : res.error);
  };

  return (
    <aside className={full ? "browser browser-full" : "browser"}>
      <div className="browser-bar">
        <button className="icon-btn" title={uz.browser.back} disabled={!state.canGoBack} onClick={() => window.kodim.browser.back()}>
          ←
        </button>
        <button className="icon-btn" title={uz.browser.forward} disabled={!state.canGoForward} onClick={() => window.kodim.browser.forward()}>
          →
        </button>
        <button className="icon-btn" title={uz.browser.reload} onClick={() => window.kodim.browser.reload()}>
          {state.loading ? "◌" : "⟳"}
        </button>
        <form className="browser-form" onSubmit={(e) => void submit(e)}>
          <input
            className="input browser-address"
            value={address}
            placeholder={uz.browser.placeholder}
            spellCheck={false}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddress(e.target.value)}
          />
        </form>
        {inspect && (
          <button className="browser-inspect" title={uz.design.toInspectHint} onClick={() => onInspect(inspect)}>
            {uz.design.toInspect}
          </button>
        )}
        <button className="icon-btn" title={full ? uz.browser.toSide : uz.browser.toFull} onClick={onToggleFull}>
          {full ? "⤡" : "⤢"}
        </button>
        <button className="icon-btn" title={uz.browser.close} onClick={onClose}>
          ×
        </button>
      </div>
      {error && <div className="browser-error">{error}</div>}
      {isFigmaLogin(state.url) && <div className="browser-note">{uz.browser.figmaLogin}</div>}
      <div className="browser-slot" ref={slotRef}>
        {!state.url && <div className="browser-empty muted">{uz.browser.empty}</div>}
      </div>
    </aside>
  );
}

/** Figma kirish sahifasi — Google orqali kirish ishlamasligi haqida eslatma. */
function isFigmaLogin(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)figma\.com$/.test(u.hostname) && /^\/(login|signup|email_only)/.test(u.pathname);
  } catch {
    return false;
  }
}
