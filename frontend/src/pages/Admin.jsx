import { AlertTriangle, CheckCircle2, Cloud, Database, HardDrive, KeyRound, Loader2, RefreshCw, Server, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header.jsx';
import { api } from '../services/api.js';
import { getLocalBridgeConfig, localBridge, saveLocalBridgeConfig } from '../services/localBridge.js';

const TABS = [
  ['drives', 'Google Drive', Cloud],
  ['telegram', 'Telegram / HDs', HardDrive],
  ['users', 'Usuários', Users],
  ['system', 'Sistema', Server]
];

function date(value) {
  if (!value) return 'Nunca';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export default function Admin() {
  const [tab, setTab] = useState('drives');
  const [status, setStatus] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [users, setUsers] = useState([]);
  const [userError, setUserError] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const initialLocal = useMemo(() => getLocalBridgeConfig(), []);
  const [workerUrl, setWorkerUrl] = useState(initialLocal.url);
  const [workerToken, setWorkerToken] = useState(initialLocal.token);
  const [workerHealth, setWorkerHealth] = useState(null);
  const [workerError, setWorkerError] = useState('');

  async function refreshCore() {
    setLoading(true);
    const [lib, diag] = await Promise.allSettled([api.getLibraryStatus(true), api.diagnostics()]);
    if (lib.status === 'fulfilled') setStatus(lib.value);
    if (diag.status === 'fulfilled') setDiagnostics(diag.value);
    setLoading(false);
  }

  async function refreshUsers() {
    setUserError('');
    try { setUsers((await api.adminUsers()).users || []); }
    catch (e) { setUserError(e?.message || 'Não foi possível carregar os usuários.'); }
  }

  async function testWorker(save = false) {
    setWorkerError('');
    try {
      if (save) saveLocalBridgeConfig({ url: workerUrl, token: workerToken });
      const result = await localBridge.test();
      setWorkerHealth(result);
      return true;
    } catch (e) {
      setWorkerHealth(null);
      setWorkerError(e?.message || 'Não foi possível conectar ao Worker local.');
      return false;
    }
  }

  useEffect(() => { refreshCore(); refreshUsers(); if (initialLocal.token) testWorker(false); }, []);

  async function syncSource(source) {
    if (!source?.id || syncing) return;
    setSyncing(source.id); setSyncError(''); setSyncMessage('');
    let continuation = null;
    let pass = 0;
    try {
      do {
        pass += 1;
        const result = await api.syncDriveSource(source.id, continuation);
        continuation = result.continuation || null;
        const summary = result.source || {};
        setSyncMessage(`${source.label}: ${Number(summary.files || 0).toLocaleString('pt-BR')} HQs encontradas · ${Number(summary.folders || 0).toLocaleString('pt-BR')} pastas · lote ${pass}`);
        await refreshCore();
      } while (continuation && pass < 2000);
      if (continuation) throw new Error('A sincronização atingiu o limite de segurança de 2.000 lotes.');
      const refreshed = await api.getLibraryStatus(true);
      const finalSource = (refreshed.sourceStats || []).find((item) => item.id === source.id);
      if (finalSource?.ok === false || Number(finalSource?.failedFolders || 0) > 0) {
        throw new Error(`${source.label}: ${Number(finalSource?.failedFolders || 0)} pasta(s) não puderam ser lidas após 3 tentativas.`);
      }
      setSyncMessage(`${source.label} sincronizado por completo.`);
      window.dispatchEvent(new CustomEvent('hq-reader:library-updated'));
    } catch (e) {
      setSyncError(e?.message || `Falha ao sincronizar ${source.label}.`);
    } finally { setSyncing(''); }
  }

  async function syncAll() {
    for (const source of status?.sourceStats || []) {
      await syncSource(source);
    }
  }

  async function changeRole(id, role) {
    setUserError('');
    try {
      await api.updateAdminUser(id, { role });
      setUsers((items) => items.map((item) => item.id === id ? { ...item, role } : item));
    } catch (e) { setUserError(e?.message || 'Não foi possível alterar o papel.'); }
  }

  const driveConfigured = Boolean(status?.googleDriveApiConfigured || diagnostics?.drive?.apiKeyConfigured);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header />
      <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="halftone overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><div className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-[#ef233c]"><ShieldCheck className="h-4 w-4" /> Administração</div><h1 className="font-display text-5xl font-black uppercase tracking-wide">Painel administrativo</h1><p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Infraestrutura, fontes, usuários e conexão com os HDs ficam aqui. O painel do usuário recebe apenas a biblioteca.</p></div>
            <button onClick={() => { refreshCore(); refreshUsers(); }} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-2.5 text-sm font-extrabold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
          </div>
        </section>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{TABS.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-extrabold transition ${tab === id ? 'border-[#ef233c] bg-[#ef233c] text-white' : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]'}`}><Icon className="h-4 w-4" /> {label}</button>)}</div>

        {tab === 'drives' && (
          <section className="mt-6 space-y-5">
            <div className={`comic-panel rounded-2xl p-5 ${driveConfigured ? '' : 'border-[#ffd60a]/35'}`}>
              <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#00d4ff]/10 text-[#00d4ff]"><Cloud className="h-5 w-5" /></span><div><h2 className="font-display text-2xl font-black uppercase">Varredura completa dos Drives</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">A v3.2 usa a Google Drive API v3 com paginação oficial e percorre subpastas recursivamente. O seed de 698 itens é apenas fallback inicial.</p></div></div><button disabled={!driveConfigured || Boolean(syncing)} onClick={syncAll} className="rounded-xl bg-[#00d4ff] px-4 py-2.5 text-sm font-black text-black disabled:opacity-40">Sincronizar todos</button></div>
              {!driveConfigured && <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#ffd60a]/25 bg-[#ffd60a]/10 p-4 text-sm text-[#ffd60a]"><KeyRound className="mt-0.5 h-4 w-4 shrink-0" /><div>Adicione <code className="font-bold">GOOGLE_DRIVE_API_KEY</code> no <code>.env</code> e reinicie <code>npm run dev</code>. Sem ela, a biblioteca continua abrindo, mas a busca completa pelos Drives não é iniciada.</div></div>}
            </div>

            {syncMessage && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">{syncMessage}</div>}
            {syncError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{syncError}</div>}

            <div className="grid gap-4 lg:grid-cols-2">{(status?.sourceStats || []).map((source) => (
              <article key={source.id} className="comic-panel rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#00d4ff]">{source.category}</p><h3 className="mt-1 font-display text-2xl font-black uppercase">{source.label}</h3><p className="mt-1 max-w-lg truncate text-xs text-[var(--muted)]" title={source.url}>{source.url}</p></div><span className={`hq-badge ${source.complete ? 'text-emerald-500' : source.ok === false ? 'text-red-500' : 'text-[#ffd60a]'}`}>{source.complete ? 'Completo' : source.ok === false ? 'Erro' : 'Pendente'}</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-[var(--panel-2)] p-3"><div className="text-[10px] uppercase text-[var(--muted)]">HQs</div><div className="mt-1 text-lg font-black">{Number(source.files || 0).toLocaleString('pt-BR')}</div></div><div className="rounded-xl bg-[var(--panel-2)] p-3"><div className="text-[10px] uppercase text-[var(--muted)]">Pastas</div><div className="mt-1 text-lg font-black">{Number(source.folders || 0).toLocaleString('pt-BR')}</div></div><div className="rounded-xl bg-[var(--panel-2)] p-3"><div className="text-[10px] uppercase text-[var(--muted)]">Falhas</div><div className="mt-1 text-lg font-black">{Number(source.failedFolders || 0)}</div></div></div>
                <div className="mt-4 flex items-center justify-between gap-3"><div className="text-xs text-[var(--muted)]">Última sync: {date(source.lastSyncedAt)}{source.engine ? ` · ${source.engine}` : ''}</div><button disabled={!driveConfigured || Boolean(syncing)} onClick={() => syncSource(source)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-xs font-extrabold disabled:opacity-40">{syncing === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar</button></div>
                {source.lastError && <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{source.lastError}</div>}
              </article>
            ))}</div>
          </section>
        )}

        {tab === 'telegram' && (
          <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <div className="comic-panel rounded-2xl p-6"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#ffd60a]/10 text-[#ffd60a]"><HardDrive className="h-5 w-5" /></span><div><h2 className="font-display text-2xl font-black uppercase">Worker local + dois HDs</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">A URL e o token ficam somente no painel administrativo. Depois de salvos neste navegador, a biblioteca principal passa a consultar o catálogo Telegram automaticamente.</p></div></div>
              <div className="mt-5 grid gap-3"><label className="text-xs font-bold text-[var(--muted)]">URL do Worker<input value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[#ffd60a]" placeholder="http://127.0.0.1:8787" /></label><label className="text-xs font-bold text-[var(--muted)]">Token local<input value={workerToken} onChange={(e) => setWorkerToken(e.target.value)} type="password" className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[#ffd60a]" placeholder="data/local_api_token.txt" /></label><button onClick={() => testWorker(true)} className="rounded-xl bg-[#ffd60a] px-4 py-3 text-sm font-black text-black">Salvar e testar conexão</button></div>
              {workerError && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">{workerError}</div>}
            </div>
            <div className="comic-panel rounded-2xl p-6"><h3 className="font-display text-2xl font-black uppercase">Estado do armazenamento</h3>{workerHealth ? <div className="mt-4 space-y-3"><div className="flex items-center gap-2 text-sm font-bold text-emerald-500"><CheckCircle2 className="h-4 w-4" /> Worker conectado</div>{(workerHealth.volumes || []).map((volume) => <div key={volume.id || volume.path} className="rounded-xl bg-[var(--panel-2)] p-4"><div className="font-bold">{volume.path || volume.root || 'HD'}</div><div className="mt-1 text-xs text-[var(--muted)]">Livre: {volume.freeHuman || volume.free || '—'} · Total: {volume.totalHuman || volume.total || '—'}</div></div>)}<div className="rounded-xl bg-[var(--panel-2)] p-4 text-sm"><strong>{Number(workerHealth.catalog?.total || 0).toLocaleString('pt-BR')}</strong> arquivos catalogados</div></div> : <div className="mt-4 flex items-start gap-2 text-sm text-[var(--muted)]"><AlertTriangle className="mt-0.5 h-4 w-4 text-[#ffd60a]" /> Conecte o Worker para visualizar os HDs e o catálogo local.</div>}</div>
          </section>
        )}

        {tab === 'users' && (
          <section className="mt-6 comic-panel rounded-2xl p-6"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#ef233c]/10 text-[#ef233c]"><Users className="h-5 w-5" /></span><div><h2 className="font-display text-2xl font-black uppercase">Usuários</h2><p className="mt-1 text-sm text-[var(--muted)]">Contas são criadas pelo login/cadastro do Supabase e aparecem em <code>profiles</code>. O admin pode alterar o papel.</p></div></div>{userError && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">{userError}</div>}<div className="mt-5 overflow-x-auto rounded-xl border border-[var(--line)]"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[var(--panel-2)] text-xs uppercase text-[var(--muted)]"><tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">E-mail</th><th className="px-4 py-3">Papel</th><th className="px-4 py-3">Criado</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-[var(--line)]"><td className="px-4 py-3 font-bold">{user.displayName}</td><td className="px-4 py-3 text-[var(--muted)]">{user.email}</td><td className="px-4 py-3"><select value={user.role} onChange={(e) => changeRole(user.id, e.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 font-bold"><option value="user">Usuário</option><option value="admin">Admin</option></select></td><td className="px-4 py-3 text-[var(--muted)]">{date(user.createdAt)}</td></tr>)}{!users.length && !userError && <tr><td colSpan="4" className="px-4 py-8 text-center text-[var(--muted)]">Nenhum perfil encontrado.</td></tr>}</tbody></table></div></section>
        )}

        {tab === 'system' && (
          <section className="mt-6 grid gap-5 lg:grid-cols-2"><div className="comic-panel rounded-2xl p-6"><div className="flex items-center gap-3"><Database className="h-5 w-5 text-[#00d4ff]" /><h2 className="font-display text-2xl font-black uppercase">Diagnóstico</h2></div><div className="mt-5 space-y-3 text-sm"><StatusLine label="API local" ok={diagnostics?.ok} /><StatusLine label="Supabase leitura" ok={diagnostics?.supabase?.readable} /><StatusLine label="Schema do catálogo" ok={diagnostics?.supabase?.schemaAvailable} optional /><StatusLine label="Chave server-side" ok={diagnostics?.supabase?.serverKeyConfigured} optional /><StatusLine label="Google Drive API" ok={diagnostics?.drive?.apiKeyConfigured} /><StatusLine label="Catálogo carregado" ok={Number(diagnostics?.catalog?.total || 0) > 0} value={`${Number(diagnostics?.catalog?.total || 0).toLocaleString('pt-BR')} HQs`} /></div></div><div className="comic-panel rounded-2xl p-6"><h2 className="font-display text-2xl font-black uppercase">Sem erro 500 genérico</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">A biblioteca v3.2 carrega o seed/runtime local primeiro. Falhas opcionais do Supabase não bloqueiam a home. Erros de configuração administrativa retornam códigos específicos e ficam visíveis aqui.</p>{(diagnostics?.catalog?.warnings || []).length > 0 && <div className="mt-4 space-y-2">{diagnostics.catalog.warnings.map((item, i) => <div key={i} className="rounded-lg bg-[#ffd60a]/10 px-3 py-2 text-xs text-[#ffd60a]">{item}</div>)}</div>}</div></section>
        )}
      </main>
    </div>
  );
}

function StatusLine({ label, ok, value, optional = false }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--panel-2)] px-4 py-3"><span className="font-semibold">{label}</span><span className={`inline-flex items-center gap-1.5 text-xs font-black ${ok ? 'text-emerald-500' : optional ? 'text-[#ffd60a]' : 'text-red-500'}`}>{ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{value || (ok ? 'OK' : optional ? 'Opcional' : 'Configurar')}</span></div>;
}
