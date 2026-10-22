import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TeacherRole } from "@exam-ide/shared";
import { api, setUnauthorizedHandler, tokenStore } from "./api";

interface Me {
  id: string;
  name: string;
  email: string;
  role: TeacherRole;
}

interface AuthState {
  me: Me | null;
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  /** Google OAuth'dan qaytgan token bilan kirish. */
  loginWithToken(token: string): Promise<void>;
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
    tokenStore.clear();
    setMe(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api
      .get<Me>("/me")
      .then(setMe)
      // 401 — token eskirgan (api.ts o'zi tozalaydi). Server o'chiq bo'lsa ham login ekrani — abadiy yuklanish yo'q.
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; teacher: Me }>("/auth/login", { email, password });
    tokenStore.set(res.token);
    setMe(res.teacher);
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    tokenStore.set(token);
    setMe(await api.get<Me>("/me"));
  }, []);

  const value = useMemo<AuthState>(() => ({ me, ready, login, loginWithToken, logout }), [me, ready, login, loginWithToken, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
