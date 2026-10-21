import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, tokenStore } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { uz } from "../uz";
import { errorText, useToast } from "./ui";

// Imtihondagi Figma dizaynlari holati (server tokeningiz bilan oldindan olgan freymlar).
// O'quvchilar "Dizayn ko'rish" da aynan shu freymlarni ko'radi.

export interface FigmaStatusItem {
  url: string;
  status: "PENDING" | "READY" | "ERROR" | "MISSING";
  error: string | null;
  errorText: string | null;
  fileName: string | null;
  frames: { id: string; name: string; width: number; height: number; hasImage: boolean }[];
  fetchedAt: string | null;
  cacheId: string | null;
}

interface Settings {
  figma: { configured: boolean; handle: string | null };
}

export function FigmaStatus({ examId, compact = false }: { examId: string; compact?: boolean }) {
  const toast = useToast();
  const list = useLoad(() => api.get<FigmaStatusItem[]>(`/exams/${examId}/figma`), [examId]);
  const settings = useLoad(() => api.get<Settings>("/settings"), []);
  const [busy, setBusy] = useState(false);
  const items = list.data ?? [];

  // Fon rejimida olinayotgan bo'lsa — tayyor bo'lguncha yangilab turamiz.
  const pending = items.some((i) => i.status === "PENDING" || i.status === "MISSING");
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => void list.reload(true), 2500);
    return () => window.clearInterval(t);
  }, [pending, list]);

  if (list.status !== "ready" || items.length === 0) return null;

  const refresh = async () => {
    setBusy(true);
    try {
      await api.post(`/exams/${examId}/figma/refresh`);
      await list.reload(true);
      toast.success(uz.figma.refreshed);
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const errors = items.filter((i) => i.error);
  if (compact && errors.length === 0 && !pending) return null;
  const noToken = settings.data && !settings.data.figma.configured;

  return (
    <section className={`card figma-card${errors.length ? " figma-card-warn" : ""}`}>
      <div className="card-head">
        <div>
          <h2 className="card-title">{uz.figma.title}</h2>
          <div className="card-sub">{uz.figma.sub}</div>
        </div>
        <button className="btn btn-sm" disabled={busy || noToken === true} onClick={() => void refresh()}>
          {busy ? uz.figma.refreshing : uz.figma.refresh}
        </button>
      </div>
      {noToken && (
        <div className="callout callout-warn">
          {uz.figma.noToken} <Link to="/settings">{uz.figma.goSettings}</Link>
        </div>
      )}
      <div className="figma-list">
        {items.map((item) => (
          <div key={item.url} className="figma-item">
            <div className="figma-item-head">
              <FigmaBadge item={item} />
              <a className="figma-url" href={item.url} target="_blank" rel="noreferrer" title={item.url}>
                {item.fileName ?? item.url}
              </a>
              {item.fetchedAt && <span className="muted small">{new Date(item.fetchedAt).toLocaleString("uz-UZ")}</span>}
            </div>
            {item.errorText && <div className="figma-error">{item.errorText}</div>}
            {!compact && item.frames.length > 0 && item.cacheId && (
              <div className="figma-frames">
                {item.frames.map((f) => (
                  <FrameThumb key={f.id} cacheId={item.cacheId!} frame={f} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FigmaBadge({ item }: { item: FigmaStatusItem }) {
  if (item.status === "READY" && !item.error) return <span className="badge badge-success">{uz.figma.ready(item.frames.length)}</span>;
  if (item.status === "READY" && item.error) return <span className="badge badge-warn">{uz.figma.stale}</span>;
  if (item.status === "ERROR") return <span className="badge badge-danger">{uz.figma.error}</span>;
  return <span className="badge badge-info">{uz.figma.pending}</span>;
}

function FrameThumb({ cacheId, frame }: { cacheId: string; frame: FigmaStatusItem["frames"][number] }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!frame.hasImage) return;
    let url: string | null = null;
    let cancelled = false;
    void fetch(`/api/figma/${cacheId}/frames/${encodeURIComponent(frame.id)}`, {
      headers: { authorization: `Bearer ${tokenStore.get() ?? ""}` },
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b || cancelled) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [cacheId, frame.id, frame.hasImage]);
  return (
    <div className="figma-frame">
      <div className="figma-frame-img">{src ? <img src={src} alt={frame.name} /> : <span className="muted small">{frame.hasImage ? "…" : uz.figma.noImage}</span>}</div>
      <div className="figma-frame-name" title={frame.name}>
        {frame.name}
      </div>
      <div className="muted small">
        {Math.round(frame.width)} × {Math.round(frame.height)}
      </div>
    </div>
  );
}
