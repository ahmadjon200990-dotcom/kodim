import { useCallback, useEffect, useState } from "react";
import { DESIGNS_DIR, isReadonlyPath, QUESTIONS_FILE } from "@exam-ide/shared";
import type { ClientState } from "../../../common/api";
import { useDialog } from "../Dialog";
import { closeModel, discardUnder, onSaveError, reloadFromDisk } from "../models";
import { uz } from "../uz";
import { BrowserPanel } from "./BrowserPanel";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { TerminalPanel } from "./TerminalPanel";
import { TopBar } from "./TopBar";

const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const isUnder = (p: string, root: string) => p === root || p.startsWith(`${root}/`);

export function Workspace({ state }: { state: ClientState }) {
  const dialog = useDialog();
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);

  useEffect(() => onSaveError((msg) => void dialog.alert(msg)), [dialog]);

  // Diskda o'zgargan (tashqi yoki tiklangan) ochiq faylni qayta yuklash.
  useEffect(() => window.kodim.onDiskChange((path) => void reloadFromDisk(path)), []);

  const open = useCallback((path: string) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
  }, []);

  // Ish boshlanganda savollar ochiq bo'lsin.
  useEffect(() => {
    open(QUESTIONS_FILE);
  }, [state.workspaceVersion, open]);

  const closeTab = async (path: string) => {
    await closeModel(path);
    setTabs((t) => {
      const i = t.indexOf(path);
      const next = t.filter((p) => p !== path);
      if (active === path) setActive(next[Math.min(i, next.length - 1)] ?? null);
      return next;
    });
  };

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

  const goLive = async () => {
    const res = await window.kodim.browser.goLive();
    if (res.ok) setBrowserOpen(true);
    else await dialog.alert(res.error);
  };

  /** dizaynlar/*.md dagi Figma havolasini ichki brauzerda ochadi. */
  const openDesign = async (path: string) => {
    const text = await window.kodim.fs.read(path);
    const url = /https:\/\/(?:[\w-]+\.)?figma\.com\/\S+/i.exec(text)?.[0];
    if (!url) return dialog.alert(uz.browser.noDesignUrl);
    const res = await window.kodim.browser.navigate(url);
    if (!res.ok) return dialog.alert(res.error);
    setBrowserOpen(true);
  };

  const isDesign = active !== null && active.startsWith(`${DESIGNS_DIR}/`) && active.endsWith(".md");

  return (
    <div className="ws">
      <TopBar state={state} />
      {!state.connected && <div className="offline-banner">{uz.status.offline}</div>}
      <div className="ws-main">
        <aside className="sidebar">
          <FileTree
            version={state.workspaceVersion}
            locked={state.locked}
            activePath={active}
            onOpen={open}
            onRenamed={onRenamed}
            onDeleted={onDeleted}
          />
        </aside>
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
            {isDesign && !state.locked && (
              <button className="btn tab-action" onClick={() => void openDesign(active)}>
                {uz.browser.openDesign}
              </button>
            )}
          </div>
          <EditorPane path={active} readOnly={state.locked || (active !== null && isReadonlyPath(active))} locked={state.locked} />
          <TerminalPanel locked={state.locked} />
        </section>
        {browserOpen && !state.locked && <BrowserPanel onClose={() => setBrowserOpen(false)} />}
      </div>
      <footer className="statusbar">
        <span>{state.connected ? uz.status.online : uz.status.offline}</span>
        <span>{active ?? ""}</span>
        <span className="status-right">
          <span>{uz.status.saved}</span>
          {!state.locked && (
            <>
              <button className="status-btn" onClick={() => setBrowserOpen((o) => !o)}>
                {uz.browser.title}
              </button>
              <button className="status-btn" onClick={() => void goLive()}>
                ◉ {uz.browser.goLive}
              </button>
            </>
          )}
        </span>
      </footer>
    </div>
  );
}
