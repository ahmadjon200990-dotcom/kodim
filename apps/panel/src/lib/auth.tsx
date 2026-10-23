import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMe, setUnauthorizedHandler, type Me } from "./backend";
import { supabase } from "./supabase";

interface AuthState {
  me: Me | null;
  ready: boolean;
  /** Seed admin: email + parol (Supabase Auth). */
  login(email: string, password: string): Promise<void>;
  /** Google OAuth (Supabase) — `/auth/callback` ga qaytadi. */
  loginWithGoogle(): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider yo'q");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setMe(null);
    void supabase.auth.signOut();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    // Sessiya bor bo'lsa o'qituvchi qatori o'qiladi; yo'q/bloklangan/o'qituvchi emas — login ekrani (abadiy yuklanish yo'q).
    const load = () =>
      getMe().then(
        (m) => setMe(m),
        () => setMe(null),
      );
    void supabase.auth
      .getSession()
      .then(({ data }) => (data.session ? load() : undefined))
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setMe(null);
      if (event === "SIGNED_IN") void load();
    });
    return () => data.subscription.unsubscribe();
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      setMe(await getMe());
    } catch (e) {
      await supabase.auth.signOut();
      throw e;
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }, []);

  const value = useMemo<AuthState>(() => ({ me, ready, login, loginWithGoogle, logout }), [me, ready, login, loginWithGoogle, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
