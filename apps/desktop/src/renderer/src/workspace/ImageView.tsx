import { useEffect, useState } from "react";
import { uz } from "../uz";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Rasm faylini editor maydonida VS Code kabi ko'rsatadi: masshtab, o'lcham va hajm ma'lumoti. */
export function ImageView({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  /** null — oynaga moslash; aks holda masshtab (1 = 100%). */
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(false);
    setNatural(null);
    setZoom(null);
    void window.kodim.fs
      .readImage(path)
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const bytes = src ? Math.floor(((src.length - src.indexOf(",") - 1) * 3) / 4) : 0;
  const step = (dir: 1 | -1) => setZoom((z) => Math.min(16, Math.max(0.1, (z ?? 1) * (dir > 0 ? 1.25 : 0.8))));

  return (
    <div className="image-view">
      <div
        className="image-stage"
        onWheel={(e) => {
          if (e.ctrlKey) step(e.deltaY < 0 ? 1 : -1);
        }}
      >
        {error ? (
          <div className="muted">{uz.editor.imageFailed}</div>
        ) : src ? (
          <img
            src={src}
            alt={path}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onClick={() => step(1)}
            style={
              zoom === null
                ? { maxWidth: "100%", maxHeight: "100%" }
                : { width: natural ? natural.w * zoom : undefined, maxWidth: "none", maxHeight: "none" }
            }
          />
        ) : (
          <div className="muted small">{uz.editor.loading}</div>
        )}
      </div>
      <div className="image-bar">
        <span>{natural ? `${natural.w} × ${natural.h}` : "—"}</span>
        <span>{bytes ? formatSize(bytes) : ""}</span>
        <span className="sb-spacer" />
        <button className="icon-btn" title={uz.editor.zoomOut} onClick={() => step(-1)}>
          −
        </button>
        <span className="image-zoom">{zoom === null ? uz.editor.zoomFit : `${Math.round(zoom * 100)}%`}</span>
        <button className="icon-btn" title={uz.editor.zoomIn} onClick={() => step(1)}>
          +
        </button>
        <button className="icon-btn" title={uz.editor.zoomReal} onClick={() => setZoom(1)}>
          1:1
        </button>
        <button className="icon-btn" title={uz.editor.zoomFit} onClick={() => setZoom(null)}>
          ⤢
        </button>
      </div>
    </div>
  );
}
