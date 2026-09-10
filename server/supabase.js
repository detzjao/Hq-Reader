import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
export const supabasePublishableKey = String(
  process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || ''
).trim();
export const supabaseServerKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SECRET_KEY
  || ''
).trim();

function makeClient(key, extraHeaders = {}) {
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'hq-reader-server/3.2.1', ...extraHeaders } }
  });
}

export const supabasePublic = makeClient(supabasePublishableKey);
export const supabaseAdmin = makeClient(supabaseServerKey);
export const supabase = supabaseAdmin || supabasePublic;

export function supabaseForAccessToken(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token || !supabasePublishableKey) return null;
  return makeClient(supabasePublishableKey, { Authorization: `Bearer ${token}` });
}

export function hasSupabase() { return Boolean(supabasePublic || supabaseAdmin); }
export function hasSupabaseRead() { return Boolean(supabasePublic || supabaseAdmin); }
export function hasSupabaseWrite() { return Boolean(supabaseAdmin); }

export function requireSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const error = new Error('A chave de servidor do Supabase não está configurada. Preencha SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY no .env e reinicie o servidor local.');
  error.code = 'SUPABASE_SERVER_KEY_REQUIRED';
  error.status = 503;
  throw error;
}

export function supabaseConfiguration() {
  return {
    configured: hasSupabase(),
    readable: hasSupabaseRead(),
    writable: hasSupabaseWrite(),
    url: supabaseUrl || null,
    publishableKeyConfigured: Boolean(supabasePublishableKey),
    serverKeyConfigured: Boolean(supabaseServerKey)
  };
}
