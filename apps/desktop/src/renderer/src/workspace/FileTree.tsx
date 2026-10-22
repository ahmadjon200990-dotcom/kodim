import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { DESIGNS_DIR } from "@exam-ide/shared";
import type { FsEntry } from "../../../common/api";
import { useDialog } from "../Dialog";
import { INTERNAL_DRAG_TYPE } from "../guard";
import { saveAll } from "../models";
import { uz } from "../uz";
import { Codicon } from "./Codicon";
import { FileIcon, FolderIcon } from "./icons";

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const isUnder = (p: string, root: string) => p === root || p.startsWith(`${root}/`);

interface Props {
  version: number;
  locked: boolean;
  activePath: string | null;
  onOpen(path: string): void;
  /** Ikkinchi editor guruhida ochish (VS Code "Open to the Side"). */
  onOpenToSide(path: string): void;
  onRenamed(from: string, to: string): void;
  onDeleted(path: string): void;
}

interface Menu {
  x: number;
  y: number;
  entry: FsEntry | null;
}

const designRoot = (dir: string) => dir === DESIGNS_DIR || dir.startsWith(`${DESIGNS_DIR}/`);

/** Fayllar panelidagi ichki "clipboard" (faqat ilova ichida, tizim clipboard'iga tegmaydi). */
interface FileClip {
  mode: "copy" | "cut";
  path: string;
}

export function FileTree({ version, locked, activePath, onOpen, onOpenToSide, onRenamed, onDeleted }: Props) {
  const dialog = useDialog();
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [clip, setClip] = useState<FileClip | null>(null);
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

  const paste = async (base: FsEntry | null) => {
    if (!clip) return;
    const dir = targetDir(base);
    if (designRoot(dir)) return;
    if (clip.mode === "cut") {
      await moveInto(clip.path, dir);
      setClip(null);
      return;
    }
    const res = await window.kodim.fs.copy(clip.path, dir);
    if (!res.ok) return void dialog.alert(res.error);
    if (dir) setExpanded((s) => new Set(s).add(dir));
    await refreshAll();
  };

  const copyPath = (entry: FsEntry) => void window.kodim.clipboard.write(entry.path);

  const openMenu = (e: MouseEvent, entry: FsEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    setSelected(entry);
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (locked) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "v" && clip) {
      e.preventDefault();
      void paste(selected);
      return;
    }
    if (!selected) return;
    if (ctrl && e.key.toLowerCase() === "c") {
      e.preventDefault();
      setClip({ mode: "copy", path: selected.path });
    } else if (ctrl && e.key.toLowerCase() === "x" && !selected.readonly) {
      e.preventDefault();
      setClip({ mode: "cut", path: selected.path });
    } else if (e.key === "Enter" && selected.type === "file") {
      e.preventDefault();
      onOpen(selected.path);
    } else if (e.key === "F2" && !selected.readonly) {
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
            className={`tree-row${clip?.mode === "cut" && clip.path === entry.path ? " tree-cut" : ""}${isActive ? " tree-row-active" : ""}${dropTarget === (isDir ? entry.path : "") ? " tree-drop" : ""}`}
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
            <Codicon name="newFile" />
          </button>
          <button className="icon-btn" title={uz.tree.newFolder} disabled={locked} onClick={() => void create("dir", selected)}>
            <Codicon name="newFolder" />
          </button>
          <button className="icon-btn" title={uz.tree.collapse} onClick={() => setExpanded(new Set())}>
            <Codicon name="collapse" />
          </button>
          <button className="icon-btn" title={uz.tree.refresh} onClick={() => void refreshAll()}>
            <Codicon name="refresh" />
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
        <div className="context-menu" style={{ left: menu.x, top: Math.min(menu.y, window.innerHeight - 330) }} onClick={(e) => e.stopPropagation()}>
          {(() => {
            const ro = menuEntry?.readonly ?? false;
            const dirRo = designRoot(targetDir(menuEntry));
            const item = (label: string, key: string, enabled: boolean, fn: () => void, danger = false) => (
              <div
                className={`context-item${enabled ? "" : " context-disabled"}${danger ? " context-danger" : ""}`}
                onClick={() => {
                  if (!enabled) return;
                  setMenu(null);
                  fn();
                }}
              >
                {label} {key && <span className="context-key">{key}</span>}
              </div>
            );
            return (
              <>
                {item(uz.tree.newFile, "", !dirRo, () => void create("file", menuEntry))}
                {item(uz.tree.newFolder, "", !dirRo, () => void create("dir", menuEntry))}
                {menuEntry?.type === "file" && (
                  <>
                    <div className="context-sep" />
                    {item(uz.tree.open, "Enter", true, () => onOpen(menuEntry.path))}
                    {item(uz.tree.openToSide, "", true, () => onOpenToSide(menuEntry.path))}
                  </>
                )}
                <div className="context-sep" />
                {menuEntry && item(uz.tree.cut, "Ctrl+X", !ro, () => setClip({ mode: "cut", path: menuEntry.path }))}
                {menuEntry && item(uz.tree.copy, "Ctrl+C", true, () => setClip({ mode: "copy", path: menuEntry.path }))}
                {item(uz.tree.paste, "Ctrl+V", clip !== null && !dirRo, () => void paste(menuEntry))}
                {menuEntry && (
                  <>
                    <div className="context-sep" />
                    {item(uz.tree.copyPath, "", true, () => copyPath(menuEntry))}
                    <div className="context-sep" />
                    {item(uz.tree.rename, "F2", !ro, () => void rename(menuEntry))}
                    {item(uz.tree.delete, "Delete", !ro, () => void remove(menuEntry), true)}
                  </>
                )}
                {ro && <div className="context-note">{uz.editor.readonly}</div>}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
