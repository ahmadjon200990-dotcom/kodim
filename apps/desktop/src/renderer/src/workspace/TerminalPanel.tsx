import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { ShellKind } from "@exam-ide/shared";
import type { TerminalProfiles } from "../../../common/api";
import { useDialog } from "../Dialog";
import { uz } from "../uz";
import { Codicon } from "./Codicon";

// Terminal paneli (CLAUDE.md 0.3, 0.8.2) — VS Code kabi: profillar (PowerShell, cmd, Git Bash, WSL), nomlash,
// bo'lish (2 ta yonma-yon), tozalash, o'chirish. xterm faqat CHIQISHni ko'rsatadi; kiritma har terminal ostidagi
// qator orqali — Enter'da main process shell sintaksisi bilan ruxsatni tekshiradi. Copy/paste — ichki clipboard.

interface Tab {
  id: number;
  kind: ShellKind;
  /** Foydalanuvchi bergan nom (bo'lmasa "powershell 1"). */
  name: string | null;
  index: number;
  exited: boolean;
  busy: boolean;
}

interface Instance {
  term: Terminal;
  fit: FitAddon;
  history: string[];
  historyIndex: number;
}

interface Menu {
  x: number;
  y: number;
  id: number;
}

const THEME = {
  background: "#181818",
  foreground: "#cccccc",
  cursor: "#aeafad",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

const SHORT: Record<ShellKind, string> = { powershell: "powershell", cmd: "cmd", gitbash: "bash", wsl: "wsl" };

/** Bitta guruhda ko'pi bilan 2 terminal yonma-yon. */
const MAX_SPLIT = 2;

export function TerminalPanel({ locked }: { locked: boolean }) {
  const dialog = useDialog();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [groups, setGroups] = useState<number[][]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  /** Oxirgi bloklangan buyruq sababi (terminal qayta chizilsa ham ko'rinib tursin). */
  const [blocked, setBlocked] = useState<Record<number, { line: string; reason: string } | null>>({});
  const [profiles, setProfiles] = useState<TerminalProfiles | null>(null);
  const [profileMenu, setProfileMenu] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const instances = useRef(new Map<number, Instance>());
  const pending = useRef(new Map<number, string[]>());
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const bodyRef = useRef<HTMLDivElement>(null);
  const creating = useRef(false);
  const focusOnMount = useRef(new Set<number>());
  const counters = useRef<Record<string, number>>({});

  const activeGroup = groups.find((g) => focused !== null && g.includes(focused)) ?? groups[groups.length - 1] ?? [];
  const tabOf = (id: number) => tabs.find((t) => t.id === id);
  const label = (t: Tab) => t.name ?? `${SHORT[t.kind]} ${t.index}`;

  useEffect(() => {
    void window.kodim.terminal.profiles().then(setProfiles);
  }, []);

  const fitAll = useCallback(() => {
    for (const id of activeGroup) {
      const inst = instances.current.get(id);
      if (!inst) continue;
      try {
        inst.fit.fit();
        window.kodim.terminal.resize(id, inst.term.cols, inst.term.rows);
      } catch {
        // panel ko'rinmayotgan bo'lishi mumkin
      }
    }
  }, [activeGroup]);

  /** Yangi terminal: `splitOf` berilsa — o'sha terminal yoniga (bitta guruhda). */
  const create = useCallback(
    async (kind: ShellKind | null, focus: boolean, splitOf?: number) => {
      if (creating.current) return;
      creating.current = true;
      const res = await window.kodim.terminal.create(kind, 100, 12);
      creating.current = false;
      if (!res.ok) {
        await dialog.alert(res.error);
        return;
      }
      const n = (counters.current[res.kind] ?? 0) + 1;
      counters.current[res.kind] = n;
      if (focus) focusOnMount.current.add(res.id);
      setTabs((t) => [...t, { id: res.id, kind: res.kind, name: null, index: n, exited: false, busy: false }]);
      setGroups((gs) => {
        const at = splitOf === undefined ? -1 : gs.findIndex((g) => g.includes(splitOf));
        if (at >= 0 && gs[at]!.length < MAX_SPLIT) return gs.map((g, i) => (i === at ? [...g, res.id] : g));
        return [...gs, [res.id]];
      });
      setFocused(res.id);
    },
    [dialog],
  );

  const pickProfile = (kind: ShellKind) => {
    setProfileMenu(false);
    window.kodim.terminal.setDefault(kind);
    setProfiles((p) => (p ? { ...p, defaultKind: kind } : p));
    void create(kind, true);
  };

  const close = (id: number) => {
    window.kodim.terminal.kill(id);
    instances.current.get(id)?.term.dispose();
    instances.current.delete(id);
    pending.current.delete(id);
    inputs.current.delete(id);
    setTabs((t) => t.filter((x) => x.id !== id));
    setGroups((gs) => {
      const next = gs.map((g) => g.filter((x) => x !== id)).filter((g) => g.length > 0);
      if (focused === id) {
        const same = gs.find((g) => g.includes(id))?.find((x) => x !== id);
        setFocused(same ?? next[next.length - 1]?.[0] ?? null);
      }
      return next;
    });
  };

  const rename = async (id: number) => {
    const t = tabOf(id);
    if (!t) return;
    const name = await dialog.prompt(uz.terminal.renameTitle, label(t));
    if (name === null) return;
    setTabs((ts) => ts.map((x) => (x.id === id ? { ...x, name: name.trim() || null } : x)));
  };

  const clear = (id: number | null) => {
    if (id === null) return;
    instances.current.get(id)?.term.clear();
  };

  const copySelection = async (id: number): Promise<boolean> => {
    const term = instances.current.get(id)?.term;
    const text = term?.getSelection() ?? "";
    if (!text) return false;
    await window.kodim.clipboard.write(text);
    term?.clearSelection();
    return true;
  };

  const pasteInto = async (id: number) => {
    const text = await window.kodim.clipboard.paste("terminal");
    if (!text) return;
    // Bir qatorli kiritma: ko'p qatorli matn bo'shliq bilan birlashtiriladi (zanjirlash baribir tekshiriladi).
    setValues((v) => ({ ...v, [id]: (v[id] ?? "") + text.replace(/\r?\n/g, " ") }));
    inputs.current.get(id)?.focus();
  };

  const mount = (id: number, el: HTMLDivElement | null) => {
    if (!el || instances.current.has(id)) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    instances.current.set(id, { term, fit, history: [], historyIndex: 0 });
    for (const chunk of pending.current.get(id) ?? []) term.write(chunk);
    pending.current.delete(id);
    requestAnimationFrame(() => {
      try {
        fit.fit();
        window.kodim.terminal.resize(id, term.cols, term.rows);
        if (focusOnMount.current.delete(id)) inputs.current.get(id)?.focus();
      } catch {
        // e'tiborsiz
      }
    });
  };

  useEffect(() => {
    const offData = window.kodim.terminal.onData((id, data) => {
      const inst = instances.current.get(id);
      if (inst) inst.term.write(data);
      else pending.current.set(id, [...(pending.current.get(id) ?? []), data]);
    });
    const offExit = window.kodim.terminal.onExit((id) => {
      instances.current.get(id)?.term.write(`\r\n\x1b[90m${uz.terminal.exited}\x1b[0m\r\n`);
      setTabs((t) => t.map((x) => (x.id === id ? { ...x, exited: true } : x)));
    });
    const offBusy = window.kodim.terminal.onBusy((id, busy) => setTabs((t) => t.map((x) => (x.id === id ? { ...x, busy } : x))));
    return () => {
      offData();
      offExit();
      offBusy();
    };
  }, []);

  // Panel birinchi marta ochilganda standart profil bilan bitta terminal.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || locked) return;
    autoStarted.current = true;
    void create(null, false);
  }, [create, locked]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitAll());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitAll]);

  useEffect(() => {
    requestAnimationFrame(fitAll);
  }, [groups, focused, fitAll]);

  useEffect(
    () => () => {
      for (const [id, { term }] of instances.current) {
        window.kodim.terminal.kill(id);
        term.dispose();
      }
      instances.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!menu && !profileMenu) return;
    const off = () => {
      setMenu(null);
      setProfileMenu(false);
    };
    window.addEventListener("click", off);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("click", off);
      window.removeEventListener("blur", off);
    };
  }, [menu, profileMenu]);

  const submit = async (id: number) => {
    if (locked) return;
    const line = values[id] ?? "";
    setValues((v) => ({ ...v, [id]: "" }));
    const inst = instances.current.get(id);
    if (inst && line.trim()) {
      inst.history.push(line);
      if (inst.history.length > 200) inst.history.shift();
      inst.historyIndex = inst.history.length;
    }
    const res = await window.kodim.terminal.submit(id, line);
    setBlocked((b) => ({ ...b, [id]: res.ok && !res.forwarded ? { line, reason: res.blocked } : null }));
    if (!res.ok) setBlocked((b) => ({ ...b, [id]: { line, reason: res.error } }));
    inst?.term.scrollToBottom();
  };

  const complete = async (id: number) => {
    const value = values[id] ?? "";
    const last = value.split(/\s+/).pop() ?? "";
    const matches = await window.kodim.terminal.complete(id, last);
    if (matches.length === 0) return;
    const head = value.slice(0, value.length - last.length);
    if (matches.length === 1) {
      setValues((v) => ({ ...v, [id]: head + matches[0] }));
    } else {
      // Umumiy boshlang'ich qismgacha to'ldirish.
      let prefix = matches[0]!;
      for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
      setValues((v) => ({ ...v, [id]: head + prefix }));
      instances.current.get(id)?.term.write(`\r\n\x1b[90m${matches.join("  ")}\x1b[0m\r\n`);
    }
  };

  const onKey = (id: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    const inst = instances.current.get(id);
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === "Enter") {
      e.preventDefault();
      void submit(id);
    } else if (e.key === "Tab") {
      e.preventDefault();
      void complete(id);
    } else if (ctrl && e.shiftKey && k === "c") {
      e.preventDefault();
      void copySelection(id);
    } else if (ctrl && e.shiftKey && k === "v") {
      e.preventDefault();
      void pasteInto(id);
    } else if (ctrl && !e.shiftKey && k === "c") {
      // Kiritmada tanlov bo'lsa — guard nusxalaydi; terminal chiqishida tanlov bo'lsa — uni nusxalaymiz;
      // aks holda ishlayotgan jarayonni to'xtatamiz (VS Code kabi).
      const input = e.currentTarget;
      if (input.selectionStart !== input.selectionEnd) return;
      e.preventDefault();
      if (inst?.term.hasSelection()) {
        void copySelection(id);
        return;
      }
      window.kodim.terminal.interrupt(id);
      setValues((v) => ({ ...v, [id]: "" }));
    } else if (ctrl && k === "l") {
      e.preventDefault();
      clear(id);
    } else if (e.key === "ArrowUp" && inst) {
      e.preventDefault();
      inst.historyIndex = Math.max(0, inst.historyIndex - 1);
      setValues((v) => ({ ...v, [id]: inst.history[inst.historyIndex] ?? "" }));
    } else if (e.key === "ArrowDown" && inst) {
      e.preventDefault();
      inst.historyIndex = Math.min(inst.history.length, inst.historyIndex + 1);
      setValues((v) => ({ ...v, [id]: inst.history[inst.historyIndex] ?? "" }));
    } else if (e.key === "PageUp" && inst) {
      e.preventDefault();
      inst.term.scrollPages(-1);
    } else if (e.key === "PageDown" && inst) {
      e.preventDefault();
      inst.term.scrollPages(1);
    }
  };

  const focusedTab = focused !== null ? tabOf(focused) : undefined;
  const canSplit = focused !== null && activeGroup.length < MAX_SPLIT && !locked;

  return (
    <div className="bottom-panel">
      <div className="panel-tabbar">
        <div className="panel-title">{uz.panel.terminal}</div>
        <div className="term-tabs">
          {groups.map((g) =>
            g.map((id, i) => {
              const t = tabOf(id);
              if (!t) return null;
              const inActive = g === activeGroup;
              return (
                <div
                  key={id}
                  className={`term-tab${id === focused ? " term-tab-active" : inActive ? " term-tab-group" : ""}`}
                  title={`${label(t)} — ${uz.terminal.renameHint}`}
                  onClick={() => {
                    setFocused(id);
                    requestAnimationFrame(() => inputs.current.get(id)?.focus());
                  }}
                  onDoubleClick={() => void rename(id)}
                >
                  {i > 0 && <span className="term-split-mark">┊</span>}
                  <span className={`term-kind term-kind-${t.kind}`}>{t.busy ? "●" : "❯"}</span>
                  <span className="term-tab-name">{label(t)}</span>
                  {t.exited && <span className="term-exited">✕</span>}
                  <button
                    className="term-close"
                    title={uz.terminal.close}
                    onClick={(e) => {
                      e.stopPropagation();
                      close(id);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            }),
          )}
        </div>
        <div className="panel-actions">
          <span className="term-hint">{uz.terminal.hint}</span>
          <div className="term-new">
            <button
              className="icon-btn"
              title={`${uz.terminal.new}${profiles?.defaultKind ? ` (${profiles.profiles.find((p) => p.kind === profiles.defaultKind)?.label ?? ""})` : ""}`}
              disabled={locked}
              onClick={() => void create(null, true)}
            >
              <Codicon name="add" />
            </button>
            <button
              className="icon-btn term-new-drop"
              title={uz.terminal.profiles}
              disabled={locked}
              onClick={(e) => {
                e.stopPropagation();
                setProfileMenu((o) => !o);
              }}
            >
              <Codicon name="chevronDown" size={12} />
            </button>
            {profileMenu && profiles && (
              <div className="context-menu term-profile-menu" onClick={(e) => e.stopPropagation()}>
                {profiles.profiles.map((p) => (
                  <div key={p.kind} className="context-item" onClick={() => pickProfile(p.kind)}>
                    <span>
                      <span className={`term-kind term-kind-${p.kind}`}>❯</span> {p.label}
                    </span>
                    {p.kind === profiles.defaultKind && <span className="context-key">{uz.terminal.defaultMark}</span>}
                  </div>
                ))}
                {profiles.profiles.length === 0 && <div className="context-item context-disabled">{uz.terminal.noProfiles}</div>}
                <div className="context-sep" />
                <div className="context-hint">{uz.terminal.profilesHint}</div>
              </div>
            )}
          </div>
          <button className="icon-btn" title={uz.terminal.split} disabled={!canSplit} onClick={() => focusedTab && void create(focusedTab.kind, true, focusedTab.id)}>
            <Codicon name="split" />
          </button>
          <button className="icon-btn" title={uz.terminal.clear} disabled={focused === null} onClick={() => clear(focused)}>
            <Codicon name="clear" />
          </button>
          <button className="icon-btn" title={uz.terminal.kill} disabled={focused === null} onClick={() => focused !== null && close(focused)}>
            <Codicon name="trash" />
          </button>
        </div>
      </div>
      <div className="term-body" ref={bodyRef}>
        {groups.map((g) => (
          <div key={g[0]} className="term-group" style={{ display: g === activeGroup ? "flex" : "none" }}>
            {g.map((id) => {
              const t = tabOf(id);
              if (!t) return null;
              return (
                <div
                  key={id}
                  className={`term-pane${g.length > 1 && id === focused ? " term-pane-focused" : ""}`}
                  onMouseDown={() => setFocused(id)}
                >
                  <div
                    className="term-host"
                    ref={(el) => mount(id, el)}
                    onMouseUp={() => {
                      // Matn tanlanmagan bo'lsa — kiritmaga fokus.
                      if (!instances.current.get(id)?.term.hasSelection()) inputs.current.get(id)?.focus();
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setFocused(id);
                      setMenu({ x: e.clientX, y: e.clientY, id });
                    }}
                  />
                  {blocked[id] && (
                    <div className="term-blocked" onClick={() => setBlocked((b) => ({ ...b, [id]: null }))} title={uz.dialog.ok}>
                      <span className="term-blocked-icon">⊘</span>
                      <code>{blocked[id]!.line}</code>
                      <span>{blocked[id]!.reason}</span>
                    </div>
                  )}
                  <div className="term-inputbar">
                    <span className="term-prompt">{t.busy ? "…" : "›"}</span>
                    <input
                      ref={(el) => {
                        if (el) inputs.current.set(id, el);
                      }}
                      className="term-input"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={locked || t.exited}
                      placeholder={locked ? uz.editor.locked : t.busy ? uz.terminal.placeholderBusy : uz.terminal.placeholder}
                      value={values[id] ?? ""}
                      onFocus={() => setFocused(id)}
                      onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
                      onKeyDown={onKey(id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <div className="muted small term-empty">{locked ? uz.editor.locked : uz.terminal.none}</div>}
      </div>
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div
            className="context-item"
            onClick={() => {
              setMenu(null);
              void copySelection(menu.id);
            }}
          >
            {uz.editor.copy} <span className="context-key">Ctrl+Shift+C</span>
          </div>
          <div
            className={locked ? "context-item context-disabled" : "context-item"}
            onClick={() => {
              setMenu(null);
              if (!locked) void pasteInto(menu.id);
            }}
          >
            {uz.editor.paste} <span className="context-key">Ctrl+Shift+V</span>
          </div>
          <div
            className="context-item"
            onClick={() => {
              setMenu(null);
              instances.current.get(menu.id)?.term.selectAll();
            }}
          >
            {uz.editor.selectAll}
          </div>
          <div className="context-sep" />
          <div
            className="context-item"
            onClick={() => {
              setMenu(null);
              clear(menu.id);
            }}
          >
            {uz.terminal.clear} <span className="context-key">Ctrl+L</span>
          </div>
          <div
            className="context-item"
            onClick={() => {
              setMenu(null);
              void rename(menu.id);
            }}
          >
            {uz.terminal.rename}
          </div>
          <div
            className={canSplit ? "context-item" : "context-item context-disabled"}
            onClick={() => {
              setMenu(null);
              const t = tabOf(menu.id);
              if (canSplit && t) void create(t.kind, true, t.id);
            }}
          >
            {uz.terminal.split}
          </div>
          <div
            className="context-item"
            onClick={() => {
              setMenu(null);
              close(menu.id);
            }}
          >
            {uz.terminal.kill}
          </div>
        </div>
      )}
    </div>
  );
}
