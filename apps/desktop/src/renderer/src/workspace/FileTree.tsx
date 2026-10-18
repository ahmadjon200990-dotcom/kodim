import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { FsEntry } from "../../../common/api";
import { useDialog } from "../Dialog";
import { saveAll } from "../models";
import { uz } from "../uz";

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

const EXT_COLORS: Record<string, string> = {
  html: "#e44d26",
  css: "#42a5f5",
  js: "#f1dd35",
  jsx: "#61dafb",
  ts: "#3178c6",
  tsx: "#61dafb",
  json: "#cbcb41",
  md: "#519aba",
};

function fileColor(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return EXT_COLORS[ext] ?? "#8c8c8c";
}

interface Props {
  version: number;
  locked: boolean;
  activePath: string | null;
  onOpen(path: string): void;
  onRenamed(from: string, to: string): void;
  onDeleted(path: string): void;
}

interface Menu {
  x: number;
  y: number;
  entry: FsEntry | null;
}

export function FileTree({ version, locked, activePath, onOpen, onRenamed, onDeleted }: Props) {
  const dialog = useDialog();
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const load = useCallback(async (dir: string) => {
    const list = await window.kodim.fs.list(dir);
    setChildren((c) => ({ ...c, [dir]: list }));
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all(["", ...expandedRef.current].map((d) => load(d)));
  }, [load]);

  useEffect(() => {
    void refreshAll();
    // Terminal orqali yaratilgan fayllar ham ko'rinsin.
    const t = window.setInterval(() => void refreshAll(), 3000);
    return () => window.clearInterval(t);
  }, [version, refreshAll]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const toggle = (dir: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        void load(dir);
      }
      return next;
    });
  };

  const targetDir = (entry: FsEntry | null) =>
    !entry ? "" : entry.type === "dir" ? entry.path : parentOf(entry.path);

  const showError = async (res: { ok: boolean; error?: string }) => {
    if (!res.ok && res.error) await dialog.alert(res.error);
    return res.ok;
  };

  const create = async (kind: "file" | "dir", base: FsEntry | null) => {
    const dir = targetDir(base);
    if (dir === "dizaynlar" || dir.startsWith("dizaynlar/")) return;
    const name = await dialog.prompt(kind === "file" ? uz.tree.newFileName : uz.tree.newFolderName);
    if (!name) return;
    const path = joinPath(dir, name.replace(/\\/g, "/"));
    const res = kind === "file" ? await window.kodim.fs.createFile(path) : await window.kodim.fs.createDir(path);
    if (!(await showError(res))) return;
    if (dir) setExpanded((s) => new Set(s).add(dir));
    await refreshAll();
    if (dir) await load(dir);
    if (kind === "file") onOpen(path);
  };

  const rename = async (entry: FsEntry) => {
    const name = await dialog.prompt(uz.tree.renameTitle, entry.name);
    if (!name || name === entry.name) return;
    const to = joinPath(parentOf(entry.path), name.replace(/\\/g, "/"));
    await saveAll();
    if (!(await showError(await window.kodim.fs.rename(entry.path, to)))) return;
    onRenamed(entry.path, to);
    await refreshAll();
  };

  const remove = async (entry: FsEntry) => {
    const yes = await dialog.confirm(uz.tree.deleteTitle, uz.tree.deleteText(entry.name), uz.tree.delete, true);
    if (!yes) return;
    if (!(await showError(await window.kodim.fs.remove(entry.path)))) return;
    onDeleted(entry.path);
    await refreshAll();
  };

  const openMenu = (e: MouseEvent, entry: FsEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    setSelected(entry);
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const renderDir = (dir: string, depth: number) => {
    const list = children[dir];
    if (!list) return null;
    if (list.length === 0 && depth > 0) {
      return (
        <div className="tree-empty" style={{ paddingLeft: 8 + depth * 12 }}>
          {uz.tree.empty}
        </div>
      );
    }
    return list.map((entry) => {
      const isOpen = expanded.has(entry.path);
      const isActive = entry.path === activePath || entry.path === selected?.path;
      return (
        <div key={entry.path}>
          <div
            className={isActive ? "tree-row tree-row-active" : "tree-row"}
            style={{ paddingLeft: 8 + depth * 12 }}
            title={entry.readonly ? `${entry.path} (${uz.tree.readonly})` : entry.path}
            onClick={() => {
              setSelected(entry);
              if (entry.type === "dir") toggle(entry.path);
              else onOpen(entry.path);
            }}
            onContextMenu={(e) => openMenu(e, entry)}
          >
            {entry.type === "dir" ? (
              <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
            ) : (
              <span className="tree-dot" style={{ background: fileColor(entry.name) }} />
            )}
            <span className="tree-name">{entry.name}</span>
            {entry.readonly && <span className="tree-lock">🔒</span>}
          </div>
          {entry.type === "dir" && isOpen && renderDir(entry.path, depth + 1)}
        </div>
      );
    });
  };

  const menuEntry = menu?.entry ?? null;
  return (
    <div className="tree" onContextMenu={(e) => openMenu(e, null)}>
      <div className="pane-header">
        <span>{uz.tree.title}</span>
        <div className="pane-actions">
          <button className="icon-btn" title={uz.tree.newFile} disabled={locked} onClick={() => void create("file", selected)}>
            ＋
          </button>
          <button className="icon-btn" title={uz.tree.newFolder} disabled={locked} onClick={() => void create("dir", selected)}>
            ▣
          </button>
          <button className="icon-btn" title={uz.tree.refresh} onClick={() => void refreshAll()}>
            ⟳
          </button>
        </div>
      </div>
      <div className="tree-body" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
        {renderDir("", 0)}
      </div>
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {(!menuEntry || !menuEntry.readonly) && (
            <>
              <div className="context-item" onClick={() => (setMenu(null), void create("file", menuEntry))}>
                {uz.tree.newFile}
              </div>
              <div className="context-item" onClick={() => (setMenu(null), void create("dir", menuEntry))}>
                {uz.tree.newFolder}
              </div>
            </>
          )}
          {menuEntry && !menuEntry.readonly && (
            <>
              <div className="context-sep" />
              <div className="context-item" onClick={() => (setMenu(null), void rename(menuEntry))}>
                {uz.tree.rename}
              </div>
              <div className="context-item context-danger" onClick={() => (setMenu(null), void remove(menuEntry))}>
                {uz.tree.delete}
              </div>
            </>
          )}
          {menuEntry?.readonly && <div className="context-item context-disabled">{uz.editor.readonly}</div>}
        </div>
      )}
    </div>
  );
}
