import { checkSupabaseSchema } from '../supabaseStore.js';
import { supabaseConfiguration } from '../supabase.js';

export default async function supabaseHealth(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  const config = supabaseConfiguration();
  let schemaReady = false;
  if (config.readable) schemaReady = await checkSupabaseSchema().catch(() => false);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    enabled: config.configured,
    readable: config.readable,
    writable: config.writable,
    schemaReady,
    provider: 'supabase',
    url: config.url
  });
}
