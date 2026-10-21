import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { errorText, PageMessage, PageSkeleton, useModal, useToast } from "../components/ui";
import { uz } from "../uz";

interface Settings {
  figma: { configured: boolean; handle: string | null };
}

/** O'qituvchi sozlamalari: Figma tokeni (serverda shifrlangan holda saqlanadi, qayta ko'rsatilmaydi). */
export function SettingsPage() {
  const toast = useToast();
  const modal = useModal();
  const settings = useLoad(() => api.get<Settings>("/settings"), []);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (settings.status === "loading") return <PageSkeleton />;
  if (settings.status !== "ready") return <PageMessage kind="error" text={settings.error ?? ""} onRetry={() => void settings.reload()} />;
  const figma = settings.data.figma;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (token.trim().length < 20) return setError(uz.settings.tokenShort);
    setBusy(true);
    try {
      await api.put("/settings/figma", { token: token.trim() });
      setToken("");
      await settings.reload(true);
      toast.success(uz.settings.saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const yes = await modal.confirm({ title: uz.settings.removeTitle, text: uz.settings.removeText, okLabel: uz.settings.remove, danger: true });
    if (!yes) return;
    try {
      await api.del("/settings/figma");
      await settings.reload(true);
      toast.success(uz.settings.removed);
    } catch (err) {
      toast.error(uz.common.error, errorText(err));
    }
  };

  return (
    <div className="page narrow-page">
      <div className="page-head">
        <div>
          <h1>{uz.settings.title}</h1>
          <div className="page-sub">{uz.settings.sub}</div>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">{uz.settings.figmaTitle}</h2>
            <div className="card-sub">{uz.settings.figmaSub}</div>
          </div>
          {figma.configured ? (
            <span className="badge badge-success">{uz.settings.connected(figma.handle)}</span>
          ) : (
            <span className="badge">{uz.settings.notConnected}</span>
          )}
        </div>

        <form className="settings-form" onSubmit={(e) => void save(e)}>
          <label className="field">
            <span>{figma.configured ? uz.settings.replaceToken : uz.settings.token}</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="figd_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions form-actions-start">
            <button className="btn btn-primary" disabled={busy || !token.trim()}>
              {busy ? uz.settings.checking : uz.settings.save}
            </button>
            {figma.configured && (
              <button type="button" className="btn btn-danger-ghost" onClick={() => void remove()}>
                {uz.settings.remove}
              </button>
            )}
          </div>
        </form>

        <div className="howto">
          <div className="howto-title">{uz.settings.howTitle}</div>
          <ol>
            {uz.settings.howSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="hint">{uz.settings.security}</div>
        </div>
      </section>
    </div>
  );
}
