import { useEffect, useState, type FormEvent } from "react";
import { BRAND } from "@exam-ide/shared";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { uz } from "../uz";

/** Google OAuth'dan qaytgandagi xato (`/auth/callback#error=...` → login sahifasiga uzatiladi). */
export const OAUTH_ERROR_KEY = "kodim.oauthError";

export function Login() {
  const { login, loginWithGoogle } = useAuth();
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    void api.get<{ google: boolean }>("/auth/config").then((c) => setGoogle(c.google), () => setGoogle(false));
    const oauthError = sessionStorage.getItem(OAUTH_ERROR_KEY);
    if (oauthError) {
      sessionStorage.removeItem(OAUTH_ERROR_KEY);
      setError(uz.login.googleErrors[oauthError] ?? uz.common.error);
    }
  }, []);
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
      const network = (err instanceof ApiError && err.status === 0) || (err instanceof Error && /fetch|network/i.test(err.message));
      setError(network ? uz.common.network : err instanceof ApiError && err.status === 403 ? (uz.login.googleErrors.disabled ?? uz.login.failed) : uz.login.failed);
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
        {google && (
          <>
            <button type="button" className="btn btn-google btn-block" onClick={() => void loginWithGoogle().catch(() => setError(uz.login.googleErrors.google ?? uz.common.error))}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              {uz.login.google}
            </button>
            <div className="login-or">{uz.login.or}</div>
          </>
        )}
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
        {google && <div className="login-hint">{uz.login.googleHint}</div>}
      </form>
    </div>
  );
}
