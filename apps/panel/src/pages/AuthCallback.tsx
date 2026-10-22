import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { OAUTH_ERROR_KEY } from "./Login";
import { uz } from "../uz";

/** Google OAuth'dan qaytish: `#token=...` yoki `#error=...` (fragment — serverga va loglarga bormaydi). */
export function AuthCallback() {
  const { loginWithToken } = useAuth();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", "/");
    const token = params.get("token");
    if (token) {
      void loginWithToken(token).then(
        () => window.location.replace("/"),
        () => {
          sessionStorage.setItem(OAUTH_ERROR_KEY, "google");
          window.location.replace("/");
        },
      );
    } else {
      sessionStorage.setItem(OAUTH_ERROR_KEY, params.get("error") ?? "google");
      window.location.replace("/");
    }
  }, [loginWithToken]);
  return <div className="center muted">{uz.common.loading}</div>;
}
