import { migrateLegacyCatalogToSupabase } from '../server/catalog.js';
import { supabaseConfiguration } from '../server/supabase.js';

const config = supabaseConfiguration();
if (!config.writable) {
  console.error('SUPABASE_SERVICE_ROLE_KEY não está configurada.');
  process.exit(1);
}

try {
  const result = await migrateLegacyCatalogToSupabase();
  console.log(`Migração concluída: ${result.comics} HQs e ${result.sources} fontes enviadas ao Supabase.`);
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}
