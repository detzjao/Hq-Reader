import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabaseClient, supabaseConfigured } from '../services/supabaseClient.js';

const AuthContext = createContext(null);


function clearLocalUserCache() {
  try {
    localStorage.removeItem('hq-reader:favorites:v1');
    localStorage.removeItem('hq-reader:shared-state-pending:v1');
    localStorage.removeItem('hq-reader:shared-state-migrated:v1');
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index));
    for (const key of keys) {
      if (key?.startsWith('hq-reader:reading:') || key?.startsWith('hq-reader:progress:')) localStorage.removeItem(key);
    }
  } catch {}
}

async function loadProfile(user) {
  if (!user?.id) return null;
  if (!supabaseClient) return { id: user.id, email: user.email || '', display_name: user.email?.split('@')[0] || 'Usuário', role: 'user', profileError: 'Supabase não configurado.' };
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id,email,display_name,role,created_at,updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    // A autenticação continua funcional mesmo se a migration de profiles ainda
    // não tiver sido executada. O painel deixa claro que o usuário é comum.
    return {
      id: user.id,
      email: user.email || '',
      display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Usuário',
      role: 'user',
      profileError: error.message
    };
  }

  return data || {
    id: user.id,
    email: user.email || '',
    display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Usuário',
    role: 'user'
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (nextSession) => {
    setSession(nextSession || null);
    const nextUser = nextSession?.user || null;
    setUser(nextUser);
    if (!nextUser) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const nextProfile = await loadProfile(nextUser);
    setProfile(nextProfile);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!supabaseClient) { setLoading(false); return () => { alive = false; }; }
    supabaseClient.auth.getSession().then(({ data }) => {
      if (alive) hydrate(data?.session || null);
    }).catch(() => {
      if (alive) setLoading(false);
    });

    const { data: subscription } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) hydrate(nextSession);
    });

    return () => {
      alive = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [hydrate]);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    const next = await loadProfile(user);
    setProfile(next);
    return next;
  }, [user]);

  const signIn = useCallback(async ({ email, password }) => {
    if (!supabaseClient) throw new Error('Supabase não configurado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await hydrate(data.session);
    return data;
  }, [hydrate]);

  const signUp = useCallback(async ({ email, password, displayName }) => {
    if (!supabaseClient) throw new Error('Supabase não configurado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.');
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || '' } }
    });
    if (error) throw error;
    if (data.session) await hydrate(data.session);
    return data;
  }, [hydrate]);

  const signOut = useCallback(async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    clearLocalUserCache();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => ({
    session,
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    signIn,
    signUp,
    signOut,
    refreshProfile,
    configured: supabaseConfigured
  }), [session, user, profile, loading, signIn, signUp, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return value;
}
