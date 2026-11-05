import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, configured } from "./supabase";
import { api } from "./api";

export interface Me { role: "owner" | "teacher" | "student" | "none"; teacherId?: string; studentId?: string; classId?: string; email?: string | null; name?: string | null }
interface AuthState { loading: boolean; session: Session | null; me: Me | null; refresh: () => Promise<Me | null>; signOut: () => Promise<void>; google: (next: string) => Promise<void> }
const Ctx = createContext<AuthState>({ loading: true, session: null, me: null, refresh: async () => null, signOut: async () => {}, google: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(configured);

  const loadMe = useCallback(async (s: Session | null) => {
    if (!s) { setMe(null); return null; }
    try { const m = await api<Me>("auth", { action: "me" }); setMe(m); return m; }
    catch { setMe({ role: "none" }); return null; }
  }, []);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => { if (!alive) return; setSession(data.session); await loadMe(data.session); if (alive) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      if (evt === "SIGNED_IN" || evt === "USER_UPDATED") { setLoading(true); loadMe(s).finally(() => setLoading(false)); }
      if (evt === "SIGNED_OUT") setMe(null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadMe]);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setMe(null); }, []);
  const google = useCallback(async (next: string) => {
    try { sessionStorage.setItem("postLoginNext", next); } catch { /* ignore */ }
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback`, queryParams: { prompt: "select_account" } } });
  }, []);

  return <Ctx.Provider value={{ loading, session, me, refresh: () => loadMe(session), signOut, google }}>{children}</Ctx.Provider>;
}
