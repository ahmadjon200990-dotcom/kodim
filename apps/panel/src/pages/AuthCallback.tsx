import { useEffect } from "react";
import { getMe } from "../lib/backend";
import { supabase } from "../lib/supabase";
import { OAUTH_ERROR_KEY } from "./Login";
import { uz } from "../uz";

/** Google OAuth'dan qaytish: supabase-js `?code=` ni sessiyaga almashtiradi (PKCE); xato — `?error_description=`. */
export function AuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fail = (kind: string) => {
      sessionStorage.setItem(OAUTH_ERROR_KEY, kind);
      void supabase.auth.signOut().finally(() => window.location.replace("/"));
    };
    if (params.get("error")) return fail("google");
    const code = params.get("code");
    const exchange = code ? supabase.auth.exchangeCodeForSession(code) : supabase.auth.getSession();
    void exchange
      .then(() => getMe())
      .then(
        () => window.location.replace("/"),
        (e: unknown) => fail(e instanceof Error && /bloklangan|disabled/i.test(e.message) ? "disabled" : "google"),
      );
  }, []);
  return <div className="center muted">{uz.common.loading}</div>;
}
