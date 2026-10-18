import { useEffect, useState, type FormEvent } from "react";
import { BRAND } from "@exam-ide/shared";
import { uz } from "../uz";

export function Login({ connected }: { connected: boolean }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.kodim.getLastName().then((n) => setName((cur) => cur || n));
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
      </form>
    </div>
  );
}
