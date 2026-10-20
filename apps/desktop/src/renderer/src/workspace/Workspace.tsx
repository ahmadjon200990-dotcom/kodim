import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { DESIGNS_DIR, isIgnoredPath, isReadonlyPath, QUESTIONS_FILE } from "@exam-ide/shared";
import type { ClientState } from "../../../common/api";
import type { monaco } from "../monaco";
import { useDialog } from "../Dialog";
import { INTERNAL_DRAG_TYPE } from "../guard";
import { closeModel, discardUnder, disposeAll, onSaveError, reloadFromDisk, saveAll } from "../models";
import { uz } from "../uz";
import { BrowserPanel } from "./BrowserPanel";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { FileIcon } from "./icons";
import { Palette, type PaletteItem } from "./Palette";
import { SearchPanel } from "./SearchPanel";
import { TerminalPanel } from "./TerminalPanel";
import { TopBar } from "./TopBar";

const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const isUnder = (p: string, root: string) => p === root || p.startsWith(`${root}/`);
const isMd = (p: string) => /\.md$/i.test(p);
/** Tabni boshqa guruhga sudrashda manba guruhi (ko'chirish uchun). */
const TAB_GROUP_TYPE = "application/x-kodim-tab-group";

interface Group {
  tabs: string[];
  active: string | null;
}

type DropZone = "left" | "center" | "right";

/** Editor guruhlari (VS Code split): ko'pi bilan 2 ta, yonma-yon. */
const MAX_GROUPS = 2;

export function Workspace({ state }: { state: ClientState }) {
  const dialog = useDialog();
  const [groups, setGroups] = useState<Group[]>([{ tabs: [], active: null }]);
  const [focused, setFocused] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarView, setSidebarView] = useState<"explorer" | "search">("explorer");
  const [panelOpen, setPanelOpen] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserFull, setBrowserFull] = useState(false);
  const [sidebarW, setSidebarW] = useState(248);
  const [panelH, setPanelH] = useState(220);
  const [browserW, setBrowserW] = useState(460);
  const [mdSource, setMdSource] = useState<Set<string>>(new Set());
  const [cursors, setCursors] = useState<({ line: number; col: number } | null)[]>([null, null]);
  const [palette, setPalette] = useState<null | "command" | "files">(null);
  const [fileItems, setFileItems] = useState<PaletteItem[]>([]);
  const [dropHint, setDropHint] = useState<{ group: number; zone: DropZone } | null>(null);
  const editorRefs = useRef<(monaco.editor.IStandaloneCodeEditor | null)[]>([null, null]);

  const g = Math.min(focused, groups.length - 1);
  const active = groups[g]?.active ?? null;

  useEffect(() => onSaveError((msg) => void dialog.alert(msg)), [dialog]);
  useEffect(() => window.kodim.onDiskChange((path) => void reloadFromDisk(path)), []);
  // Ish maydoni yopilganda (topshirildi → yangi imtihon) eski imtihon modellari xotirada qolmasin:
  // aks holda keyingi imtihondagi shu nomli fayl (masalan index.html) eski matn bilan ochilib, yozib yuborilardi.
  useEffect(() => () => disposeAll(), []);

  /** Faylni `index` guruhida ochadi; `insertAt` berilsa — o'sha joyga yangi guruh qo'shiladi. */
  const openIn = useCallback((index: number, path: string, insertAt?: number) => {
    setGroups((gs) => {
      let next = gs.map((x) => ({ ...x, tabs: [...x.tabs] }));
      let target = index;
      if (insertAt !== undefined && next.length < MAX_GROUPS) {
        next.splice(insertAt, 0, { tabs: [], active: null });
        target = insertAt;
      } else if (target >= next.length) {
        if (next.length >= MAX_GROUPS) target = next.length - 1;
        else {
          next = [...next, { tabs: [], active: null }];
          target = next.length - 1;
        }
      }
      const grp = next[target]!;
      if (!grp.tabs.includes(path)) grp.tabs.push(path);
      grp.active = path;
      setFocused(target);
      return next;
    });
  }, []);

  const open = useCallback((path: string) => openIn(g, path), [openIn, g]);
  const openToSide = useCallback((path: string) => openIn(groups.length === 1 ? 1 : g === 0 ? 1 : 0, path), [openIn, groups.length, g]);

  const openAt = useCallback(
    (path: string, line: number) => {
      open(path);
      setTimeout(() => {
        const ed = editorRefs.current[g];
        if (ed && ed.getModel()?.uri.path.endsWith(path)) {
          ed.revealLineInCenter(line);
          ed.setPosition({ lineNumber: line, column: 1 });
          ed.focus();
        }
      }, 150);
    },
    [open, g],
  );

  // Ish boshlanganda faqat savollar.md ochiladi (CLAUDE.md 0.2). Qayta ulanishda (workspaceVersion oshadi)
  // ochiq tablar va faol fayl O'ZGARMAYDI — aks holda yozayotgan o'quvchining fokusi boshqa faylga ketardi.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setGroups((gs) => (gs[0]!.tabs.length ? gs : [{ tabs: [QUESTIONS_FILE], active: QUESTIONS_FILE }]));
  }, [state.workspaceVersion]);

  /** Tabni yopish. Model boshqa guruhda ham ochiq bo'lsa yopilmaydi; bo'shagan ikkinchi guruh yo'qoladi. */
  const closeTab = useCallback(
    async (index: number, path: string) => {
      const usedElsewhere = groups.some((x, i) => i !== index && x.tabs.includes(path));
      if (usedElsewhere) await saveAll();
      else await closeModel(path);
      setGroups((gs) => {
        const next = gs.map((x, i) => {
          if (i !== index) return x;
          const pos = x.tabs.indexOf(path);
          const tabs = x.tabs.filter((p) => p !== path);
          const activeNext = x.active === path ? (tabs[Math.min(pos, tabs.length - 1)] ?? null) : x.active;
          return { tabs, active: activeNext };
        });
        if (next.length > 1 && next[index]!.tabs.length === 0) {
          next.splice(index, 1);
          setFocused(0);
        }
        return next;
      });
    },
    [groups],
  );

  const onRenamed = (from: string, to: string) => {
    discardUnder(from);
    const map = (p: string) => (isUnder(p, from) ? to + p.slice(from.length) : p);
    setGroups((gs) => gs.map((x) => ({ tabs: x.tabs.map(map), active: x.active ? map(x.active) : null })));
  };

  const onDeleted = (path: string) => {
    discardUnder(path);
    setGroups((gs) => {
      const next = gs.map((x) => {
        const tabs = x.tabs.filter((p) => !isUnder(p, path));
        return { tabs, active: x.active && isUnder(x.active, path) ? (tabs[0] ?? null) : x.active };
      });
      return next.length > 1 ? next.filter((x, i) => i === 0 || x.tabs.length > 0) : next;
    });
  };

  const goLive = useCallback(async () => {
    const res = await window.kodim.browser.goLive();
    if (res.ok) setBrowserOpen(true);
    else await dialog.alert(res.error);
  }, [dialog]);

  const openDesign = async (path: string) => {
    const text = await window.kodim.fs.read(path);
    const url = /https:\/\/(?:[\w-]+\.)?figma\.com\/\S+/i.exec(text)?.[0];
    if (!url) return dialog.alert(uz.browser.noDesignUrl);
    const res = await window.kodim.browser.navigate(url);
    if (!res.ok) return dialog.alert(res.error);
    setBrowserOpen(true);
  };

  const newFile = useCallback(async () => {
    const name = await dialog.prompt(uz.tree.newFileName);
    if (!name) return;
    const res = await window.kodim.fs.createFile(name.replace(/\\/g, "/"));
    if (!res.ok) return dialog.alert(res.error);
    open(name.replace(/\\/g, "/"));
  }, [dialog, open]);

  const format = () => editorRefs.current[g]?.getAction("editor.action.formatDocument")?.run();
  const toggleMd = useCallback(() => {
    if (!active || !isMd(active) || !isReadonlyPath(active)) return;
    setMdSource((s) => {
      const next = new Set(s);
      if (next.has(active)) next.delete(active);
      else next.add(active);
      return next;
    });
  }, [active]);

  const splitEditor = useCallback(() => {
    if (active) openToSide(active);
  }, [active, openToSide]);

  // Quick open uchun barcha fayllar ro'yxati.
  const buildFileList = useCallback(async () => {
    const acc: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await window.kodim.fs.list(dir).catch(() => [])) {
        if (isIgnoredPath(e.path)) continue;
        if (e.type === "dir") await walk(e.path);
        else acc.push(e.path);
        if (acc.length > 400) return;
      }
    };
    await walk("");
    setFileItems(acc.map((p) => ({ id: p, label: p, file: true })));
  }, []);

  const openPalette = useCallback(
    (mode: "command" | "files") => {
      if (mode === "files") void buildFileList();
      setPalette(mode);
    },
    [buildFileList],
  );

  const commandItems: PaletteItem[] = [
    { id: "newFile", label: uz.palette.commands.newFile, hint: "Ctrl+N" },
    { id: "save", label: uz.palette.commands.save, hint: "Ctrl+S" },
    { id: "closeTab", label: uz.palette.commands.closeTab, hint: "Ctrl+W" },
    { id: "split", label: uz.palette.commands.split, hint: "Ctrl+\\" },
    { id: "toggleTerminal", label: uz.palette.commands.toggleTerminal, hint: "Ctrl+`" },
    { id: "toggleSidebar", label: uz.palette.commands.toggleSidebar, hint: "Ctrl+B" },
    { id: "format", label: uz.palette.commands.format, hint: "Shift+Alt+F" },
    { id: "browser", label: uz.palette.commands.browser },
    { id: "goLive", label: uz.palette.commands.goLive },
  ];

  const runCommand = (id: string) => {
    if (id === "newFile") void newFile();
    else if (id === "save") void saveAll();
    else if (id === "closeTab") {
      if (active) void closeTab(g, active);
    } else if (id === "split") splitEditor();
    else if (id === "toggleTerminal") setPanelOpen((o) => !o);
    else if (id === "toggleSidebar") setSidebarOpen((o) => !o);
    else if (id === "format") format();
    else if (id === "browser") setBrowserOpen((o) => !o);
    else if (id === "goLive") void goLive();
  };

  // Brauzer to'liq ekranda: Esc (renderer yoki brauzer sahifasidan) — yon panelga qaytadi.
  useEffect(() => window.kodim.browser.onEscape(() => setBrowserFull(false)), []);

  // Klaviatura (VS Code'ga o'xshash). Bloklangan tugmalar main'da ushlanadi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && browserFull) {
        setBrowserFull(false);
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const k = e.key.toLowerCase();
      if (e.shiftKey && k === "e") {
        e.preventDefault();
        setSidebarView("explorer");
        setSidebarOpen(true);
      } else if (e.shiftKey && k === "f") {
        e.preventDefault();
        setSidebarView("search");
        setSidebarOpen(true);
      } else if (e.shiftKey && k === "p") {
        e.preventDefault();
        openPalette("command");
      } else if (e.shiftKey && k === "v") {
        e.preventDefault();
        toggleMd();
      } else if (!e.shiftKey && k === "p") {
        e.preventDefault();
        openPalette("files");
      } else if (!e.shiftKey && k === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      } else if (!e.shiftKey && k === "j") {
        e.preventDefault();
        setPanelOpen((o) => !o);
      } else if (e.key === "`") {
        e.preventDefault();
        setPanelOpen((o) => !o);
      } else if (e.key === "\\") {
        e.preventDefault();
        splitEditor();
      } else if (!e.shiftKey && k === "n") {
        e.preventDefault();
        void newFile();
      } else if (!e.shiftKey && k === "w") {
        if (active) {
          e.preventDefault();
          void closeTab(g, active);
        }
      } else if (k === "tab") {
        e.preventDefault();
        const tabs = groups[g]?.tabs ?? [];
        if (!tabs.length) return;
        const i = active ? tabs.indexOf(active) : -1;
        const nextPath = tabs[(i + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length]!;
        setGroups((gs) => gs.map((x, idx) => (idx === g ? { ...x, active: nextPath } : x)));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, g, groups, browserFull, openPalette, newFile, closeTab, toggleMd, splitEditor]);

  // Panel o'lchamlarini sudrab o'zgartirish.
  const drag = (onMove: (dx: number, dy: number) => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: MouseEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ---- Fayl/tabni editor ustiga sudrash: chap/o'ng chekka — yonma-yon ochish (VS Code kabi).
  const zoneOf = (e: DragEvent, el: HTMLElement): DropZone => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x > 0.66) return "right";
    if (x < 0.34) return "left";
    return "center";
  };
  const onEditorDragOver = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes(INTERNAL_DRAG_TYPE)) return;
    e.preventDefault();
    const zone = zoneOf(e, e.currentTarget);
    setDropHint((h) => (h && h.group === index && h.zone === zone ? h : { group: index, zone }));
  };
  const onEditorDrop = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    const path = e.dataTransfer.getData(INTERNAL_DRAG_TYPE);
    setDropHint(null);
    if (!path) return;
    e.preventDefault();
    const zone = zoneOf(e, e.currentTarget);
    const fromGroup = e.dataTransfer.getData(TAB_GROUP_TYPE);
    const canSplit = groups.length < MAX_GROUPS;
    if (zone === "right") {
      if (canSplit) openIn(index + 1, path, index + 1);
      else openIn(index === 0 ? 1 : index, path);
    } else if (zone === "left") {
      if (canSplit) openIn(index, path, index);
      else openIn(index === 1 ? 0 : index, path);
    } else openIn(index, path);
    // Tab boshqa guruhga sudralsa — manbadan olib tashlanadi (ko'chirish).
    if (fromGroup !== "") {
      const src = Number(fromGroup);
      if (Number.isFinite(src) && groups.length > 1 && src !== index && zone === "center") {
        setGroups((gs) => {
          const next = gs.map((x, i) => (i === src ? { tabs: x.tabs.filter((p) => p !== path), active: x.active === path ? (x.tabs.find((p) => p !== path) ?? null) : x.active } : x));
          return next.filter((x, i) => next.length === 1 || x.tabs.length > 0 || i === 0);
        });
      }
    }
  };

  const r = state.runtime;
  const cursor = cursors[g] ?? null;
  const browserSide = browserOpen && !browserFull && !state.locked;
  const showBrowserFull = browserOpen && browserFull && !state.locked;

  return (
    <div className="ws">
      <TopBar state={state} />
      <div className="ws-main">
        <div className="activitybar">
          <button
            className={sidebarOpen && sidebarView === "explorer" ? "act-btn act-on" : "act-btn"}
            title={uz.activity.explorer}
            onClick={() => {
              if (sidebarView === "explorer") setSidebarOpen((o) => !o);
              else {
                setSidebarView("explorer");
                setSidebarOpen(true);
              }
            }}
          >
            🗀
          </button>
          <button
            className={sidebarOpen && sidebarView === "search" ? "act-btn act-on" : "act-btn"}
            title={uz.activity.search}
            onClick={() => {
              if (sidebarView === "search") setSidebarOpen((o) => !o);
              else {
                setSidebarView("search");
                setSidebarOpen(true);
              }
            }}
          >
            ⌕
          </button>
        </div>

        {sidebarOpen && (
          <>
            <aside className="sidebar" style={{ width: sidebarW }}>
              {sidebarView === "explorer" ? (
                <FileTree
                  version={state.workspaceVersion}
                  locked={state.locked}
                  activePath={active}
                  onOpen={open}
                  onOpenToSide={openToSide}
                  onRenamed={onRenamed}
                  onDeleted={onDeleted}
                />
              ) : (
                <SearchPanel version={state.workspaceVersion} onOpen={openAt} />
              )}
            </aside>
            <div className="splitter splitter-v" onMouseDown={drag((dx) => setSidebarW((w) => Math.max(160, Math.min(560, w + dx))))} />
          </>
        )}

        <section className="center">
          <div className="editor-area">
            <div className="groups" style={{ display: showBrowserFull ? "none" : "flex" }}>
              {groups.map((grp, index) => {
                const path = grp.active;
                const isDesign = path !== null && path.startsWith(`${DESIGNS_DIR}/`) && path.endsWith(".md");
                const showMdToggle = path !== null && isMd(path) && isReadonlyPath(path);
                const preview = path !== null && !mdSource.has(path);
                return (
                  <div
                    key={index}
                    className={`group${index === g && groups.length > 1 ? " group-focused" : ""}`}
                    onMouseDownCapture={() => setFocused(index)}
                    onFocusCapture={() => setFocused(index)}
                  >
                    <div className="tabs">
                      {grp.tabs.map((p) => (
                        <div
                          key={p}
                          className={p === path ? "tab tab-active" : "tab"}
                          title={p}
                          draggable
                          data-kodim-draggable=""
                          onDragStart={(e) => {
                            e.dataTransfer.setData(INTERNAL_DRAG_TYPE, p);
                            e.dataTransfer.setData(TAB_GROUP_TYPE, String(index));
                          }}
                          onClick={() => setGroups((gs) => gs.map((x, i) => (i === index ? { ...x, active: p } : x)))}
                          onMouseDown={(e) => e.button === 1 && void closeTab(index, p)}
                        >
                          <FileIcon name={baseName(p)} />
                          <span className="tab-name">{baseName(p)}</span>
                          {isReadonlyPath(p) && <span className="tab-lock">🔒</span>}
                          <button
                            className="tab-close"
                            title={uz.editor.close}
                            onClick={(e) => {
                              e.stopPropagation();
                              void closeTab(index, p);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <div className="tabs-actions">
                        {showMdToggle && (
                          <button className="tab-action" onClick={toggleMd}>
                            {preview ? uz.editor.viewSource : uz.editor.viewPreview}
                          </button>
                        )}
                        {isDesign && !state.locked && path && (
                          <button className="tab-action" onClick={() => void openDesign(path)}>
                            {uz.browser.openDesign}
                          </button>
                        )}
                        {path && groups.length < MAX_GROUPS && (
                          <button className="icon-btn" title={uz.palette.commands.split} onClick={() => openIn(1, path)}>
                            ◫
                          </button>
                        )}
                      </div>
                    </div>
                    {path && (
                      <div className="breadcrumbs">
                        {path.split("/").map((seg, i) => (
                          <span key={i}>
                            {i > 0 && <span className="bc-sep">›</span>}
                            <span className="bc-seg">{seg}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      className="group-body"
                      onDragOver={onEditorDragOver(index)}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropHint(null);
                      }}
                      onDrop={onEditorDrop(index)}
                    >
                      <EditorPane
                        path={path}
                        readOnly={path !== null && (state.locked || isReadonlyPath(path))}
                        locked={state.locked}
                        markdownPreview={preview}
                        onCursor={(c) => setCursors((cs) => cs.map((x, i) => (i === index ? c : x)))}
                        registerEditor={(ed) => (editorRefs.current[index] = ed)}
                      />
                      {dropHint?.group === index && <div className={`drop-overlay drop-${dropHint.zone}`} />}
                    </div>
                  </div>
                );
              })}
            </div>
            {showBrowserFull && <BrowserPanel full onToggleFull={() => setBrowserFull(false)} onClose={() => setBrowserOpen(false)} />}
          </div>
          {panelOpen && (
            <>
              <div className="splitter splitter-h" onMouseDown={drag((_dx, dy) => setPanelH((h) => Math.max(100, Math.min(560, h - dy))))} />
              <div className="panel-wrap" style={{ height: panelH }}>
                <TerminalPanel locked={state.locked} />
              </div>
            </>
          )}
        </section>

        {browserSide && (
          <>
            <div className="splitter splitter-v" onMouseDown={drag((dx) => setBrowserW((w) => Math.max(320, Math.min(900, w - dx))))} />
            <div style={{ width: browserW, display: "flex" }}>
              <BrowserPanel full={false} onToggleFull={() => setBrowserFull(true)} onClose={() => setBrowserOpen(false)} />
            </div>
          </>
        )}
      </div>

      <footer className="statusbar">
        <span className={state.connected ? "sb-item" : "sb-item sb-offline"}>
          {state.connected ? `● ${uz.statusbar.online}` : `○ ${uz.statusbar.offline}`}
        </span>
        <span className="sb-item sb-runtime" title={uz.statusbar.envWarn}>
          node: {r.node ? "✓" : "✕"} · npm: {r.npm ? "✓" : "✕"} · python: {r.python ? "✓" : "✕"}
        </span>
        <span className="sb-spacer" />
        {cursor && (
          <span className="sb-item">
            {uz.statusbar.ln} {cursor.line}, {uz.statusbar.col} {cursor.col}
          </span>
        )}
        {active && <span className="sb-item">{language(active)}</span>}
        {!state.locked && (
          <>
            <button
              className={browserOpen ? "sb-btn sb-btn-on" : "sb-btn"}
              title={uz.browser.toggleHint}
              onClick={() => {
                // Brauzer tugmasi: yopiq → to'liq ekran; keyin to'liq ↔ yon panel (yopish — paneldagi ×).
                if (!browserOpen) {
                  setBrowserOpen(true);
                  setBrowserFull(true);
                } else setBrowserFull((f) => !f);
              }}
            >
              {uz.browser.title}
            </button>
            <button className="sb-btn" onClick={() => void goLive()}>
              ◉ {uz.browser.goLive}
            </button>
          </>
        )}
      </footer>

      {palette && (
        <Palette
          mode={palette}
          items={palette === "command" ? commandItems : fileItems}
          onPick={(id) => (palette === "command" ? runCommand(id) : open(id))}
          onClose={() => setPalette(null)}
        />
      )}
    </div>
  );
}

function language(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "LESS",
    js: "JavaScript",
    jsx: "JavaScript React",
    mjs: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript React",
    json: "JSON",
    md: "Markdown",
    py: "Python",
    vue: "Vue",
    png: "Rasm",
    jpg: "Rasm",
    jpeg: "Rasm",
    gif: "Rasm",
    webp: "Rasm",
    svg: "SVG",
    ico: "Rasm",
  };
  return map[ext] ?? "Matn";
}
