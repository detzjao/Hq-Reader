import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
export const supabasePublishableKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || ''
).trim();

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabaseClient = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'hq-reader-auth'
      },
      global: { headers: { 'X-Client-Info': 'hq-reader-web/3.2.1' } }
    })
  : null;

export async function getAccessToken() {
  if (!supabaseClient) return '';
  const { data } = await supabaseClient.auth.getSession();
  return data?.session?.access_token || '';
}
