import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { DESIGNS_DIR } from "@exam-ide/shared";
import type { FsEntry } from "../../../common/api";
import { useDialog } from "../Dialog";
import { INTERNAL_DRAG_TYPE } from "../guard";
import { saveAll } from "../models";
import { uz } from "../uz";
import { FileIcon, FolderIcon } from "./icons";

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const isUnder = (p: string, root: string) => p === root || p.startsWith(`${root}/`);

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

const designRoot = (dir: string) => dir === DESIGNS_DIR || dir.startsWith(`${DESIGNS_DIR}/`);

export function FileTree({ version, locked, activePath, onOpen, onRenamed, onDeleted }: Props) {
  const dialog = useDialog();
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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
    // Terminal/tashqi o'zgarishlarni ko'rsatish: watcher disk-change + zaxira polling.
    const off = window.kodim.onDiskChange(() => void refreshAll());
    const t = window.setInterval(() => void refreshAll(), 4000);
    return () => {
      off();
      window.clearInterval(t);
    };
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

  const targetDir = (entry: FsEntry | null) => (!entry ? "" : entry.type === "dir" ? entry.path : parentOf(entry.path));
  const showError = async (res: { ok: boolean; error?: string }) => {
    if (!res.ok && res.error) await dialog.alert(res.error);
    return res.ok;
  };

  const create = async (kind: "file" | "dir", base: FsEntry | null) => {
    const dir = targetDir(base);
    if (designRoot(dir)) return;
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

  const moveInto = async (from: string, dir: string) => {
    if (parentOf(from) === dir || isUnder(dir, from)) return;
    await saveAll();
    const to = joinPath(dir, from.split("/").pop() ?? from);
    if (!(await showError(await window.kodim.fs.move(from, dir)))) return;
    onRenamed(from, to);
    if (dir) setExpanded((s) => new Set(s).add(dir));
    await refreshAll();
  };

  const openMenu = (e: MouseEvent, entry: FsEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    setSelected(entry);
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (locked || !selected) return;
    if (e.key === "F2" && !selected.readonly) {
      e.preventDefault();
      void rename(selected);
    } else if (e.key === "Delete" && !selected.readonly) {
      e.preventDefault();
      void remove(selected);
    }
  };

  const onDragStart = (e: DragEvent, entry: FsEntry) => {
    if (locked || entry.readonly) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(INTERNAL_DRAG_TYPE, entry.path);
    e.dataTransfer.setData("text/plain", entry.name);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropTo = (e: DragEvent, dir: string) => {
    e.preventDefault();
    setDropTarget(null);
    if (designRoot(dir)) return;
    const from = e.dataTransfer.getData(INTERNAL_DRAG_TYPE);
    if (from) void moveInto(from, dir);
  };

  const renderDir = (dir: string, depth: number) => {
    const list = children[dir];
    if (!list) return null;
    if (list.length === 0 && depth > 0) {
      return (
        <div className="tree-empty" style={{ paddingLeft: 10 + depth * 12 }}>
          {uz.tree.empty}
        </div>
      );
    }
    return list.map((entry) => {
      const isOpen = expanded.has(entry.path);
      const isActive = entry.path === activePath || entry.path === selected?.path;
      const isDir = entry.type === "dir";
      return (
        <div key={entry.path}>
          <div
            className={`tree-row${isActive ? " tree-row-active" : ""}${dropTarget === (isDir ? entry.path : "") ? " tree-drop" : ""}`}
            style={{ paddingLeft: 6 + depth * 12 }}
            title={entry.readonly ? `${entry.path} (${uz.tree.readonly})` : entry.path}
            draggable={!locked && !entry.readonly}
            data-kodim-draggable=""
            onDragStart={(e) => onDragStart(e, entry)}
            onDragOver={
              isDir
                ? (e) => {
                    if (e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) {
                      e.preventDefault();
                      setDropTarget(entry.path);
                    }
                  }
                : undefined
            }
            onDragLeave={isDir ? () => setDropTarget((d) => (d === entry.path ? null : d)) : undefined}
            onDrop={isDir ? (e) => onDropTo(e, entry.path) : undefined}
            onClick={() => {
              setSelected(entry);
              if (isDir) toggle(entry.path);
              else onOpen(entry.path);
            }}
            onContextMenu={(e) => openMenu(e, entry)}
          >
            {isDir && <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>}
            {isDir ? <FolderIcon name={entry.name} open={isOpen} /> : <FileIcon name={entry.name} />}
            <span className="tree-name">{entry.name}</span>
            {entry.readonly && <span className="tree-lock">🔒</span>}
          </div>
          {isDir && isOpen && renderDir(entry.path, depth + 1)}
        </div>
      );
    });
  };

  const menuEntry = menu?.entry ?? null;
  return (
    <div className="tree" tabIndex={0} onKeyDown={onKeyDown} onContextMenu={(e) => openMenu(e, null)}>
      <div className="pane-header">
        <span>{uz.tree.title}</span>
        <div className="pane-actions">
          <button className="icon-btn" title={uz.tree.newFile} disabled={locked} onClick={() => void create("file", selected)}>
            ＋
          </button>
          <button className="icon-btn" title={uz.tree.newFolder} disabled={locked} onClick={() => void create("dir", selected)}>
            ▣
          </button>
          <button className="icon-btn" title={uz.tree.collapse} onClick={() => setExpanded(new Set())}>
            ⊟
          </button>
          <button className="icon-btn" title={uz.tree.refresh} onClick={() => void refreshAll()}>
            ⟳
          </button>
        </div>
      </div>
      <div
        className="tree-body"
        onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) {
            e.preventDefault();
            setDropTarget("");
          }
        }}
        onDrop={(e) => onDropTo(e, "")}
      >
        {renderDir("", 0)}
      </div>
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {(!menuEntry || !menuEntry.readonly) && !designRoot(targetDir(menuEntry)) && (
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
                {uz.tree.rename} <span className="context-key">F2</span>
              </div>
              <div className="context-item context-danger" onClick={() => (setMenu(null), void remove(menuEntry))}>
                {uz.tree.delete} <span className="context-key">Delete</span>
              </div>
            </>
          )}
          {menuEntry?.readonly && <div className="context-item context-disabled">{uz.editor.readonly}</div>}
        </div>
      )}
    </div>
  );
}
