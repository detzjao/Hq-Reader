import { requireSupabaseAdmin, supabaseAdmin, supabaseForAccessToken, supabasePublic } from './supabase.js';

function authError(message, code = 'AUTH_REQUIRED', status = 401) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function isAdminConfigured() { return Boolean(supabaseAdmin); }

export function bearerToken(req) {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function userFromAccessToken(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) throw authError('Entre na sua conta para continuar.');
  if (!supabasePublic) throw authError('Supabase Auth não está configurado.', 'AUTH_NOT_CONFIGURED', 503);
  const { data, error } = await supabasePublic.auth.getUser(token);
  if (error || !data?.user) throw authError('Sua sessão é inválida ou expirou.', 'AUTH_INVALID', 401);
  return data.user;
}

export async function profileForUser(user, accessToken = '') {
  if (!user?.id) throw authError('Usuário inválido.', 'AUTH_INVALID', 401);

  // Primeiro usa o próprio JWT do usuário. Isso funciona com RLS e não exige
  // service_role apenas para validar se a pessoa é admin.
  const scoped = supabaseForAccessToken(accessToken);
  if (scoped) {
    const { data, error } = await scoped
      .from('profiles')
      .select('id,email,display_name,role,created_at,updated_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && data) return data;
    if (error && !/relation .*profiles.* does not exist|schema cache/i.test(error.message || '')) {
      console.warn('[PROFILE_SCOPED_LOOKUP_FAILED]', error.message);
    }
  }

  // Fallback server-side se a chave administrativa estiver disponível.
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id,email,display_name,role,created_at,updated_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && data) return data;
  }

  return {
    id: user.id,
    email: user.email || '',
    display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Usuário',
    role: 'user'
  };
}

export async function authenticatedRequest(req) {
  const accessToken = bearerToken(req);
  const user = await userFromAccessToken(accessToken);
  return { user, accessToken };
}

export async function assertAuthenticatedRequest(req) {
  const { user, accessToken } = await authenticatedRequest(req);
  const profile = await profileForUser(user, accessToken);
  return { user, profile, accessToken };
}

export async function assertAdminRequest(req) {
  const identity = await assertAuthenticatedRequest(req);
  if (identity.profile?.role !== 'admin') {
    throw authError('Esta ação exige uma conta administradora.', 'ADMIN_UNAUTHORIZED', 403);
  }
  return identity;
}

export async function assertAdminAccessToken(accessToken) {
  const user = await userFromAccessToken(accessToken);
  const profile = await profileForUser(user, accessToken);
  if (profile?.role !== 'admin') throw authError('Esta ação exige uma conta administradora.', 'ADMIN_UNAUTHORIZED', 403);
  return { user, profile };
}

export { requireSupabaseAdmin };
