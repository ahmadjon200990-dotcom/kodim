import { useState, type FormEvent } from "react";
import { BRAND } from "@exam-ide/shared";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { uz } from "../uz";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailBad = !/^\S+@\S+\.\S+$/.test(email.trim());
  const passwordBad = password.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (emailBad) return setError(uz.login.emailRequired);
    if (passwordBad) return setError(uz.login.passwordRequired);
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? uz.common.network : uz.login.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={(e) => void submit(e)} noValidate>
        <div className="login-brand">
          <span className="brand-mark">&lt;/&gt;</span> {BRAND.panelName}
        </div>
        <div className="login-slogan">{BRAND.slogan}</div>
        <label className="field">
          <span>{uz.login.email}</span>
          <input
            className={touched && emailBad ? "input invalid" : "input"}
            type="email"
            autoComplete="username"
            value={email}
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{uz.login.password}</span>
          <input
            className={touched && passwordBad ? "input invalid" : "input"}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? uz.login.busy : uz.login.submit}
        </button>
      </form>
    </div>
  );
}
