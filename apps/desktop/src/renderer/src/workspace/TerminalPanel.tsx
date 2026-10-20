import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useDialog } from "../Dialog";
import { uz } from "../uz";

interface Tab {
  id: number;
  exited: boolean;
  busy: boolean;
}

interface Instance {
  term: Terminal;
  fit: FitAddon;
  history: string[];
  historyIndex: number;
}

const THEME = {
  background: "#1e1e1e",
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

/** Terminal: xterm faqat CHIQISHni ko'rsatadi; kiritma pastdagi input orqali (ruxsat tekshiriladi). */
export function TerminalPanel({ locked }: { locked: boolean }) {
  const dialog = useDialog();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const instances = useRef(new Map<number, Instance>());
  const pending = useRef(new Map<number, string[]>());
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const creating = useRef(false);
  const focusOnMount = useRef(new Set<number>());

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

  const create = useCallback(
    async (focus: boolean) => {
      if (creating.current) return;
      creating.current = true;
      const res = await window.kodim.terminal.create(100, 12);
      creating.current = false;
      if (!res.ok) {
        await dialog.alert(res.error);
        return;
      }
      if (focus) focusOnMount.current.add(res.id);
      setTabs((t) => [...t, { id: res.id, exited: false, busy: false }]);
      setCurrent(res.id);
    },
    [dialog],
  );

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
        if (focusOnMount.current.delete(id)) inputRef.current?.focus();
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

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || locked) return;
    autoStarted.current = true;
    void create(false);
  }, [create, locked]);

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

  const submit = async () => {
    if (current === null || locked) return;
    const line = value;
    setValue("");
    const inst = instances.current.get(current);
    if (inst && line.trim()) {
      inst.history.push(line);
      if (inst.history.length > 200) inst.history.shift();
      inst.historyIndex = inst.history.length;
    }
    await window.kodim.terminal.submit(current, line);
    inst?.term.scrollToBottom();
  };

  const complete = async () => {
    if (current === null) return;
    const matches = await window.kodim.terminal.complete(current, value.split(/\s+/).pop() ?? "");
    if (matches.length === 0) return;
    const head = value.slice(0, value.length - (value.split(/\s+/).pop() ?? "").length);
    if (matches.length === 1) {
      setValue(head + matches[0]);
    } else {
      // Umumiy boshlang'ich qismgacha to'ldirish.
      let prefix = matches[0]!;
      for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
      setValue(head + prefix);
      instances.current.get(current)?.term.write(`\r\n\x1b[90m${matches.join("  ")}\x1b[0m\r\n`);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (current === null) return;
    const inst = instances.current.get(current);
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      void complete();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      // Tanlov bo'lsa nusxalash guard orqali ketadi; bo'lmasa jarayonni to'xtatamiz.
      if (!window.getSelection()?.toString()) {
        e.preventDefault();
        window.kodim.terminal.interrupt(current);
        setValue("");
      }
    } else if (e.key === "ArrowUp" && inst) {
      e.preventDefault();
      inst.historyIndex = Math.max(0, inst.historyIndex - 1);
      setValue(inst.history[inst.historyIndex] ?? "");
    } else if (e.key === "ArrowDown" && inst) {
      e.preventDefault();
      inst.historyIndex = Math.min(inst.history.length, inst.historyIndex + 1);
      setValue(inst.history[inst.historyIndex] ?? "");
    }
  };

  const busy = tabs.find((t) => t.id === current)?.busy ?? false;

  return (
    <div className="bottom-panel">
      <div className="panel-tabbar">
        <div className="term-tabs">
          {tabs.map((t, i) => (
            <div key={t.id} className={t.id === current ? "term-tab term-tab-active" : "term-tab"} onClick={() => setCurrent(t.id)}>
              <span className="term-tab-icon">▶</span>
              {`powershell ${i + 1}`}
              {t.exited && " ✕"}
              <button
                className="term-close"
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
        <div className="panel-actions">
          <span className="term-hint">{uz.terminal.hint}</span>
          <button className="icon-btn" title={uz.terminal.new} disabled={locked} onClick={() => void create(true)}>
            ＋
          </button>
        </div>
      </div>
      <div className="term-body" ref={bodyRef} onClick={() => inputRef.current?.focus()}>
        {tabs.map((t) => (
          <div key={t.id} className="term-host" style={{ display: t.id === current ? "block" : "none" }} ref={(el) => mount(t.id, el)} />
        ))}
        {tabs.length === 0 && <div className="muted small term-empty">{locked ? uz.editor.locked : uz.terminal.none}</div>}
      </div>
      {tabs.length > 0 && current !== null && (
        <div className="term-inputbar">
          <span className="term-prompt">{busy ? "…" : "›"}</span>
          <input
            ref={inputRef}
            className="term-input"
            spellCheck={false}
            autoComplete="off"
            disabled={locked}
            placeholder={locked ? uz.editor.locked : busy ? uz.terminal.placeholderBusy : uz.terminal.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
      )}
    </div>
  );
}
