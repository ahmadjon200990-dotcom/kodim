import { useState } from "react";
import { isIgnoredPath } from "@exam-ide/shared";
import { uz } from "../uz";

interface Hit {
  path: string;
  line: number;
  text: string;
}

/** Barcha fayllar bo'yicha oddiy matn qidiruvi (Ctrl+Shift+F). */
export function SearchPanel({ version, onOpen }: { version: number; onOpen(path: string, line: number): void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const walk = async (dir: string, acc: string[]): Promise<void> => {
    const list = await window.kodim.fs.list(dir).catch(() => []);
    for (const e of list) {
      if (isIgnoredPath(e.path)) continue;
      if (e.type === "dir") await walk(e.path, acc);
      else if (!e.image) acc.push(e.path);
      if (acc.length > 500) return;
    }
  };

  const search = async () => {
    const query = q.trim();
    if (!query) {
      setHits([]);
      setDone(false);
      return;
    }
    setBusy(true);
    const files: string[] = [];
    await walk("", files);
    const found: Hit[] = [];
    const needle = query.toLowerCase();
    for (const path of files) {
      const content = await window.kodim.fs.read(path).catch(() => "");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.toLowerCase().includes(needle)) {
          found.push({ path, line: i + 1, text: lines[i]!.trim().slice(0, 200) });
          if (found.length > 300) break;
        }
      }
      if (found.length > 300) break;
    }
    setHits(found);
    setBusy(false);
    setDone(true);
  };

  // version o'zgarsa natijalar eskiradi (yangi imtihon).
  void version;

  return (
    <div className="search-panel">
      <div className="pane-header">
        <span>{uz.search.title}</span>
      </div>
      <div className="search-box">
        <input
          className="input"
          placeholder={uz.search.placeholder}
          value={q}
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
      </div>
      <div className="search-results">
        {busy && <div className="muted small search-empty">…</div>}
        {!busy && done && hits.length === 0 && <div className="muted small search-empty">{uz.search.none}</div>}
        {!busy && hits.length > 0 && <div className="muted small search-count">{uz.search.matches(hits.length)}</div>}
        {hits.map((h, i) => (
          <div key={i} className="search-hit" onClick={() => onOpen(h.path, h.line)} title={h.path}>
            <div className="search-hit-path">{h.path}</div>
            <div className="search-hit-text mono">{h.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
