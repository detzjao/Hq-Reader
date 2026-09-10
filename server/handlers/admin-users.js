import { assertAdminRequest } from '../auth.js';
import { requireSupabaseAdmin, supabaseAdmin, supabaseForAccessToken } from '../supabase.js';
import { sendError } from '../http.js';

function normalizeRole(value) { return value === 'admin' ? 'admin' : 'user'; }
function mapProfile(profile = {}) {
  return {
    id: profile.id,
    email: profile.email || '',
    displayName: profile.display_name || profile.email?.split('@')[0] || 'Usuário',
    role: normalizeRole(profile.role),
    createdAt: profile.created_at || null
  };
}

async function listProfiles(scoped) {
  // A chave server-side, quando existe, garante lista completa mesmo se a
  // migration de policy admin ainda não tiver sido aplicada. Sem ela, a policy
  // da migration 004 permite ao admin listar todos via próprio JWT.
  const candidates = [supabaseAdmin, scoped].filter(Boolean);
  let lastError = null;
  for (const db of candidates) {
    const { data, error } = await db
      .from('profiles')
      .select('id,email,display_name,role,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (!error) return data || [];
    lastError = error;
  }
  const error = new Error(`Não foi possível listar os perfis${lastError?.message ? `: ${lastError.message}` : ''}. Execute as migrations 003 e 004 do Supabase.`);
  error.code = 'PROFILES_SCHEMA_OR_POLICY_REQUIRED';
  error.status = 503;
  throw error;
}

export default async function handler(req, res) {
  try {
    const identity = await assertAdminRequest(req);
    const scoped = supabaseForAccessToken(identity.accessToken);

    if (req.method === 'GET') {
      const profiles = await listProfiles(scoped);
      return res.status(200).json({ users: profiles.map(mapProfile) });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const role = normalizeRole(body.role);
      if (!id) return res.status(400).json({ error: 'Usuário inválido.', code: 'INVALID_USER' });

      if (scoped) {
        const { data, error } = await scoped.rpc('hq_admin_set_profile_role', { target_user_id: id, new_role: role });
        if (!error) return res.status(200).json({ profile: Array.isArray(data) ? data[0] : data });
        console.warn('[PROFILE_ROLE_RPC_FALLBACK]', error.message);
      }

      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin
          .from('profiles')
          .update({ role, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('id,email,display_name,role,created_at,updated_at')
          .maybeSingle();
        if (!error) return res.status(200).json({ profile: data });
        const e = new Error(`Não foi possível alterar o papel: ${error.message}`);
        e.code = 'PROFILE_ROLE_UPDATE_FAILED'; e.status = 503; throw e;
      }

      const e = new Error('Execute a migration 004 ou configure SUPABASE_SERVICE_ROLE_KEY para alterar papéis.');
      e.code = 'ADMIN_ROLE_UPDATE_NOT_CONFIGURED'; e.status = 503; throw e;
    }

    if (req.method === 'POST') {
      const db = requireSupabaseAdmin();
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const displayName = String(body.displayName || '').trim();
      const role = normalizeRole(body.role);
      if (!email || password.length < 6) return res.status(400).json({ error: 'Informe e-mail e senha com pelo menos 6 caracteres.', code: 'INVALID_USER' });
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
      if (error) { const e = new Error(`Supabase Auth: ${error.message}`); e.code = 'AUTH_ADMIN_CREATE_FAILED'; e.status = Number(error.status || 503); throw e; }
      const user = data?.user;
      if (!user?.id) { const e = new Error('O Supabase não retornou o usuário criado.'); e.code = 'AUTH_ADMIN_CREATE_EMPTY'; e.status = 502; throw e; }
      const { error: profileError } = await db.from('profiles').upsert({ id: user.id, email, display_name: displayName || email.split('@')[0], role, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (profileError) { const e = new Error(`Perfil: ${profileError.message}`); e.code = 'PROFILE_CREATE_FAILED'; e.status = 503; throw e; }
      return res.status(201).json({ user: { id: user.id, email, displayName, role } });
    }

    return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendError(res, error);
  }
}
