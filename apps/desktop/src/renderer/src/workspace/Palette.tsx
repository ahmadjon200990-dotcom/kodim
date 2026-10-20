import { useEffect, useMemo, useRef, useState } from "react";
import { FileIcon } from "./icons";
import { uz } from "../uz";

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  /** Fayl bo'lsa — ikonka uchun. */
  file?: boolean;
}

interface Props {
  mode: "command" | "files";
  items: PaletteItem[];
  onPick(id: string): void;
  onClose(): void;
}

const score = (label: string, q: string): number => {
  const l = label.toLowerCase();
  const query = q.toLowerCase();
  if (!query) return 1;
  if (l.includes(query)) return 100 - l.indexOf(query);
  // Subsequence (harflar tartibda uchrashi).
  let i = 0;
  for (const ch of l) if (ch === query[i]) i++;
  return i === query.length ? 1 : 0;
};

export function Palette({ mode, items, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const filtered = useMemo(() => {
    return items
      .map((it) => ({ it, s: score(it.label, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((x) => x.it);
  }, [items, q]);

  useEffect(() => setActive(0), [q]);

  const pick = (i: number) => {
    const item = filtered[i];
    if (item) {
      onPick(item.id);
      onClose();
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          spellCheck={false}
          placeholder={mode === "command" ? uz.palette.placeholder : uz.palette.quickOpen}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(active);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="palette-empty">{uz.palette.noResults}</div>
          ) : (
            filtered.map((it, i) => (
              <div
                key={it.id}
                className={i === active ? "palette-item active" : "palette-item"}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
              >
                {it.file && <FileIcon name={it.label} />}
                <span className="palette-label">{it.label}</span>
                {it.hint && <span className="palette-hint">{it.hint}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
