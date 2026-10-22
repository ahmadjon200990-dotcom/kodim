import { useEffect, useState, type FormEvent } from "react";
import { BRAND } from "@exam-ide/shared";
import { uz } from "../uz";

export function Login({ connected }: { connected: boolean }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [server, setServer] = useState<{ url: string; defaultUrl: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void window.kodim.getLastName().then((n) => setName((cur) => cur || n));
    void window.kodim.server.get().then(setServer);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(uz.login.badCode);
    if (name.trim().length < 2) return setError(uz.login.badName);
    setBusy(true);
    setError("");
    const res = await window.kodim.join(code, name.trim().replace(/\s+/g, " "));
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={(e) => void submit(e)}>
        <button type="button" className="icon-btn login-gear" title={uz.server.title} aria-label={uz.server.title} onClick={() => setSettingsOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
          </svg>
        </button>
        <div className="brand">
          <div className="brand-name">{BRAND.name}</div>
          <div className="brand-slogan">{BRAND.slogan}</div>
        </div>
        <label className="field">
          <span>{uz.login.code}</span>
          <input
            className="input input-code"
            inputMode="numeric"
            maxLength={6}
            placeholder={uz.login.codePlaceholder}
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </label>
        <label className="field">
          <span>{uz.login.name}</span>
          <input
            className="input"
            maxLength={60}
            placeholder={uz.login.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-block" type="submit" disabled={busy || !connected}>
          {busy ? uz.login.joining : uz.login.submit}
        </button>
        {!connected && <div className="muted small">{uz.login.connecting}</div>}
        {server && (
          <div className="login-server" title={server.url}>
            <span className={connected ? "dot dot-on" : "dot"} /> {uz.server.label}: {hostOf(server.url)}
          </div>
        )}
      </form>
      {settingsOpen && server && (
        <ServerSettings
          server={server}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            void window.kodim.server.get().then(setServer);
          }}
        />
      )}
    </div>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Server manzili: asosiy (internet), shu kompyuter yoki lokal tarmoq (LAN) — internetsiz demo uchun. */
function ServerSettings({
  server,
  onClose,
  onSaved,
}: {
  server: { url: string; defaultUrl: string };
  onClose(): void;
  onSaved(): void;
}) {
  const [value, setValue] = useState(server.url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (url: string | null) => {
    setBusy(true);
    setError("");
    const res = await window.kodim.server.set(url);
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save(value.trim());
        }}
      >
        <div className="modal-title">{uz.server.title}</div>
        <div className="modal-text">{uz.server.text}</div>
        <input className="input" value={value} spellCheck={false} autoFocus onChange={(e) => setValue(e.target.value)} placeholder="https://teacher.kodim.uz" />
        <div className="server-presets">
          <button type="button" className="tab-action" onClick={() => setValue(server.defaultUrl)}>
            {uz.server.main} ({hostOf(server.defaultUrl)})
          </button>
          <button type="button" className="tab-action" onClick={() => setValue("http://localhost:8080")}>
            {uz.server.local}
          </button>
        </div>
        <div className="muted small">{uz.server.lanHint}</div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {uz.dialog.cancel}
          </button>
          <button type="submit" className="btn" disabled={busy || !value.trim()}>
            {busy ? uz.server.checking : uz.server.save}
          </button>
        </div>
      </form>
    </div>
  );
}
