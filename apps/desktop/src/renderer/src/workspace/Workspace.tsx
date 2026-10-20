import { useCallback, useEffect, useRef, useState } from "react";
import { DESIGNS_DIR, isIgnoredPath, isReadonlyPath, QUESTIONS_FILE } from "@exam-ide/shared";
import type { ClientState } from "../../../common/api";
import type { monaco } from "../monaco";
import { useDialog } from "../Dialog";
import { closeModel, discardUnder, onSaveError, reloadFromDisk, saveAll } from "../models";
import { uz } from "../uz";
import { BrowserPanel } from "./BrowserPanel";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { Palette, type PaletteItem } from "./Palette";
import { SearchPanel } from "./SearchPanel";
import { TerminalPanel } from "./TerminalPanel";
import { TopBar } from "./TopBar";

const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const isUnder = (p: string, root: string) => p === root || p.startsWith(`${root}/`);
const isMd = (p: string) => /\.md$/i.test(p);

export function Workspace({ state }: { state: ClientState }) {
  const dialog = useDialog();
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarView, setSidebarView] = useState<"explorer" | "search">("explorer");
  const [panelOpen, setPanelOpen] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [sidebarW, setSidebarW] = useState(248);
  const [panelH, setPanelH] = useState(220);
  const [browserW, setBrowserW] = useState(460);
  const [mdSource, setMdSource] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null);
  const [palette, setPalette] = useState<null | "command" | "files">(null);
  const [fileItems, setFileItems] = useState<PaletteItem[]>([]);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => onSaveError((msg) => void dialog.alert(msg)), [dialog]);
  useEffect(() => window.kodim.onDiskChange((path) => void reloadFromDisk(path)), []);

  const open = useCallback((path: string) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
  }, []);

  const openAt = useCallback(
    (path: string, line: number) => {
      open(path);
      setTimeout(() => {
        const ed = editorRef.current;
        if (ed && ed.getModel()?.uri.path.endsWith(path)) {
          ed.revealLineInCenter(line);
          ed.setPosition({ lineNumber: line, column: 1 });
          ed.focus();
        }
      }, 120);
    },
    [open],
  );

  // Ish boshlanganda faqat savollar.md ochiladi (CLAUDE.md 0.2). Qayta ulanishda (workspaceVersion oshadi)
  // ochiq tablar va faol fayl O'ZGARMAYDI — aks holda yozayotgan o'quvchining fokusi boshqa faylga ketardi.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setTabs((t) => (t.includes(QUESTIONS_FILE) ? t : [QUESTIONS_FILE, ...t]));
    setActive((a) => a ?? QUESTIONS_FILE);
  }, [state.workspaceVersion]);

  const closeTab = useCallback(
    async (path: string) => {
      await closeModel(path);
      setTabs((t) => {
        const i = t.indexOf(path);
        const next = t.filter((p) => p !== path);
        setActive((a) => (a === path ? (next[Math.min(i, next.length - 1)] ?? null) : a));
        return next;
      });
    },
    [],
  );

  const onRenamed = (from: string, to: string) => {
    discardUnder(from);
    const map = (p: string) => (isUnder(p, from) ? to + p.slice(from.length) : p);
    setTabs((t) => t.map(map));
    setActive((a) => (a ? map(a) : a));
  };

  const onDeleted = (path: string) => {
    discardUnder(path);
    setTabs((t) => t.filter((p) => !isUnder(p, path)));
    setActive((a) => (a && isUnder(a, path) ? null : a));
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

  const format = () => editorRef.current?.getAction("editor.action.formatDocument")?.run();
  const toggleMd = useCallback(() => {
    if (!active || !isMd(active) || !isReadonlyPath(active)) return;
    setMdSource((s) => {
      const next = new Set(s);
      if (next.has(active)) next.delete(active);
      else next.add(active);
      return next;
    });
  }, [active]);

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
    { id: "toggleTerminal", label: uz.palette.commands.toggleTerminal, hint: "Ctrl+`" },
    { id: "toggleSidebar", label: uz.palette.commands.toggleSidebar, hint: "Ctrl+B" },
    { id: "format", label: uz.palette.commands.format, hint: "Shift+Alt+F" },
    { id: "goLive", label: uz.palette.commands.goLive },
  ];

  const runCommand = (id: string) => {
    if (id === "newFile") void newFile();
    else if (id === "save") void saveAll();
    else if (id === "closeTab") {
      if (active) void closeTab(active);
    } else if (id === "toggleTerminal") setPanelOpen((o) => !o);
    else if (id === "toggleSidebar") setSidebarOpen((o) => !o);
    else if (id === "format") format();
    else if (id === "goLive") void goLive();
  };

  // Klaviatura (VS Code'ga o'xshash). Bloklangan tugmalar main'da ushlanadi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      } else if (!e.shiftKey && k === "n") {
        e.preventDefault();
        void newFile();
      } else if (!e.shiftKey && k === "w") {
        if (active) {
          e.preventDefault();
          void closeTab(active);
        }
      } else if (k === "tab") {
        e.preventDefault();
        setActive((a) => {
          const i = a ? tabs.indexOf(a) : -1;
          return tabs[(i + 1) % tabs.length] ?? a;
        });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, tabs, openPalette, newFile, closeTab, toggleMd]);

  // Panel o'lchamlarini sudrab o'zgartirish.
  const drag = (onMove: (dx: number, dy: number) => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: MouseEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const isDesign = active !== null && active.startsWith(`${DESIGNS_DIR}/`) && active.endsWith(".md");
  const activeReadonly = active !== null && (state.locked || isReadonlyPath(active));
  const showMdToggle = active !== null && isMd(active) && isReadonlyPath(active);
  const markdownPreview = active !== null && !mdSource.has(active);
  const r = state.runtime;

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
          <div className="tabs">
            {tabs.map((p) => (
              <div
                key={p}
                className={p === active ? "tab tab-active" : "tab"}
                title={p}
                onClick={() => setActive(p)}
                onMouseDown={(e) => e.button === 1 && void closeTab(p)}
              >
                <span className="tab-ico" />
                <span className="tab-name">{baseName(p)}</span>
                {isReadonlyPath(p) && <span className="tab-lock">🔒</span>}
                <button
                  className="tab-close"
                  title={uz.editor.close}
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(p);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="tabs-actions">
              {showMdToggle && (
                <button className="tab-action" onClick={toggleMd}>
                  {markdownPreview ? uz.editor.viewSource : uz.editor.viewPreview}
                </button>
              )}
              {isDesign && !state.locked && (
                <button className="tab-action" onClick={() => void openDesign(active)}>
                  {uz.browser.openDesign}
                </button>
              )}
            </div>
          </div>
          {active && (
            <div className="breadcrumbs">
              {active.split("/").map((seg, i) => (
                <span key={i}>
                  {i > 0 && <span className="bc-sep">›</span>}
                  <span className="bc-seg">{seg}</span>
                </span>
              ))}
            </div>
          )}
          <EditorPane
            path={active}
            readOnly={activeReadonly}
            locked={state.locked}
            markdownPreview={markdownPreview}
            onCursor={setCursor}
            registerEditor={(ed) => (editorRef.current = ed)}
          />
          {panelOpen && (
            <>
              <div className="splitter splitter-h" onMouseDown={drag((_dx, dy) => setPanelH((h) => Math.max(100, Math.min(560, h - dy))))} />
              <div className="panel-wrap" style={{ height: panelH }}>
                <TerminalPanel locked={state.locked} />
              </div>
            </>
          )}
        </section>

        {browserOpen && !state.locked && (
          <>
            <div className="splitter splitter-v" onMouseDown={drag((dx) => setBrowserW((w) => Math.max(320, Math.min(900, w - dx))))} />
            <div style={{ width: browserW, display: "flex" }}>
              <BrowserPanel onClose={() => setBrowserOpen(false)} />
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
            <button className="sb-btn" onClick={() => setBrowserOpen((o) => !o)}>
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
    js: "JavaScript",
    jsx: "JavaScript",
    mjs: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript",
    json: "JSON",
    md: "Markdown",
    py: "Python",
    vue: "Vue",
  };
  return map[ext] ?? "Matn";
}
