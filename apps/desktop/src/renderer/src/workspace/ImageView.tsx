import { useEffect, useState } from "react";
import { uz } from "../uz";

/** Rasm faylini editor maydonida ko'rsatadi (data: URL orqali). */
export function ImageView({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(false);
    void window.kodim.fs
      .readImage(path)
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="image-view">
      {error ? (
        <div className="muted">{uz.editor.imageFailed}</div>
      ) : src ? (
        <img src={src} alt={path} />
      ) : (
        <div className="muted small">{uz.editor.loading}</div>
      )}
    </div>
  );
}
