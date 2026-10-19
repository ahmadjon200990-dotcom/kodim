import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useDialog } from "../Dialog";
import { uz } from "../uz";

interface Tab {
  id: number;
  exited: boolean;
}

interface Instance {
  term: Terminal;
  fit: FitAddon;
}

const THEME = {
  background: "#1f1f1f",
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

/** Terminal clipboard'i ham faqat ilova ichida (CLAUDE.md 5.4). */
function bindClipboard(term: Terminal): void {
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const copy = (ctrl && key === "c" && (e.shiftKey || term.hasSelection())) || (ctrl && key === "insert");
    const paste = (ctrl && key === "v") || (e.shiftKey && key === "insert");
    if (copy) {
      e.preventDefault();
      const text = term.getSelection();
      if (text) void window.kodim.clipboard.write(text);
      term.clearSelection();
      return false;
    }
    if (paste) {
      e.preventDefault();
      void window.kodim.clipboard.paste("terminal").then((text) => {
        if (text) term.paste(text);
      });
      return false;
    }
    return true;
  });
}

export function TerminalPanel({ locked }: { locked: boolean }) {
  const dialog = useDialog();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const instances = useRef(new Map<number, Instance>());
  /** Terminal DOM'ga ulanguncha kelgan chiqish. */
  const pending = useRef(new Map<number, string[]>());
  const bodyRef = useRef<HTMLDivElement>(null);
  const creating = useRef(false);

  const fitCurrent = useCallback(() => {
    if (current === null) return;
    const inst = instances.current.get(current);
    if (!inst) return;
    try {
      inst.fit.fit();
      window.kodim.terminal.resize(current, inst.term.cols, inst.term.rows);
    } catch {
      // panel ko'rinmayotgan bo'lishi mumkin
    }
  }, [current]);

  const create = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    const res = await window.kodim.terminal.create(100, 12);
    creating.current = false;
    if (!res.ok) {
      await dialog.alert(res.error);
      return;
    }
    setTabs((t) => [...t, { id: res.id, exited: false }]);
    setCurrent(res.id);
  }, [dialog]);

  const close = (id: number) => {
    window.kodim.terminal.kill(id);
    instances.current.get(id)?.term.dispose();
    instances.current.delete(id);
    pending.current.delete(id);
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id);
      if (current === id) setCurrent(next[next.length - 1]?.id ?? null);
      return next;
    });
  };

  const mount = (id: number, el: HTMLDivElement | null) => {
    if (!el || instances.current.has(id)) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      disableStdin: locked,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    bindClipboard(term);
    term.onData((data) => window.kodim.terminal.write(id, data));
    instances.current.set(id, { term, fit });
    for (const chunk of pending.current.get(id) ?? []) term.write(chunk);
    pending.current.delete(id);
    requestAnimationFrame(() => {
      try {
        fit.fit();
        window.kodim.terminal.resize(id, term.cols, term.rows);
        term.focus();
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
    return () => {
      offData();
      offExit();
    };
  }, []);

  // Birinchi terminal avtomatik ochiladi (bir marta).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || locked) return;
    autoStarted.current = true;
    void create();
  }, [create, locked]);

  useEffect(() => {
    for (const { term } of instances.current.values()) term.options.disableStdin = locked;
  }, [locked]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitCurrent());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitCurrent]);

  useEffect(() => {
    requestAnimationFrame(fitCurrent);
  }, [current, fitCurrent]);

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

  return (
    <div className="bottom-panel">
      <div className="pane-header">
        <div className="term-tabs">
          <span>{uz.panel.terminal}</span>
          {tabs.map((t, i) => (
            <div
              key={t.id}
              className={t.id === current ? "term-tab term-tab-active" : "term-tab"}
              onClick={() => setCurrent(t.id)}
            >
              {`${i + 1}: powershell`}
              {t.exited && " ✕"}
              <button
                className="tab-close term-close"
                title={uz.terminal.close}
                onClick={(e) => {
                  e.stopPropagation();
                  close(t.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="pane-actions">
          <button className="icon-btn" title={uz.terminal.new} disabled={locked} onClick={() => void create()}>
            ＋
          </button>
        </div>
      </div>
      <div className="term-body" ref={bodyRef}>
        {tabs.map((t) => (
          <div
            key={t.id}
            className="term-host"
            style={{ display: t.id === current ? "block" : "none" }}
            ref={(el) => mount(t.id, el)}
          />
        ))}
        {tabs.length === 0 && <div className="muted small term-empty">{locked ? uz.editor.locked : uz.terminal.none}</div>}
      </div>
    </div>
  );
}
