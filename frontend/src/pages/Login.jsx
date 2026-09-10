import { BookOpen, Eye, EyeOff, Loader2, LockKeyhole, Mail, UserRound, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const auth = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { document.documentElement.dataset.theme = localStorage.getItem('hq-reader:theme') || 'dark'; }, []);
  useEffect(() => { setError(''); setMessage(''); }, [mode]);

  if (!auth.loading && auth.user) {
    const target = location.state?.from && location.state.from !== '/login' ? location.state.from : '/';
    return <Navigate to={target} replace />;
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'login') await auth.signIn({ email: email.trim(), password });
      else {
        if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        const data = await auth.signUp({ email: email.trim(), password, displayName: displayName.trim() });
        if (!data.session) { setMessage('Conta criada. Confirme o e-mail enviado pelo Supabase e depois entre normalmente.'); setMode('login'); }
      }
    } catch (err) { setError(err?.message || 'Não foi possível concluir a autenticação.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div className="halftone absolute inset-0 opacity-70" />
      <main className="relative mx-auto grid min-h-screen max-w-7xl place-items-center px-4 py-8">
        <div className="comic-panel grid w-full max-w-5xl overflow-hidden rounded-[2rem] lg:grid-cols-[1.1fr_.9fr]">
          <section className="relative hidden min-h-[650px] overflow-hidden border-r border-[var(--line)] bg-[#ef233c] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-24 -top-24 h-72 w-72 rotate-12 rounded-[4rem] bg-[#ffd60a] opacity-90" />
            <div className="absolute -bottom-24 -left-20 h-64 w-64 -rotate-12 rounded-[4rem] bg-[#00d4ff] opacity-45" />
            <div className="relative flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl border-2 border-white bg-black shadow-[5px_5px_0_#ffd60a]"><BookOpen className="h-6 w-6" /></span><span className="font-display text-3xl font-black tracking-wide">HQ READER</span></div>
            <div className="relative max-w-lg"><div className="mb-3 inline-flex items-center gap-2 rounded-full border-2 border-white/70 bg-black/15 px-3 py-1.5 text-xs font-black uppercase tracking-[.16em]"><Zap className="h-3.5 w-3.5" /> Sua central de quadrinhos</div><h1 className="font-display text-6xl font-black uppercase leading-[.88] tracking-wide">Leia.<br/>Colecione.<br/><span className="text-[#ffd60a]">Continue.</span></h1><p className="mt-6 max-w-md text-sm font-semibold leading-7 text-white/80">Google Drive, acervo local do Telegram e seu progresso em uma experiência única.</p></div>
            <div className="relative text-xs font-bold uppercase tracking-[.16em] text-white/60">HQ Reader 3.2</div>
          </section>

          <section className="flex min-h-[650px] items-center bg-[var(--panel)] p-6 sm:p-10 lg:p-12">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ef233c] text-white shadow-[3px_3px_0_#ffd60a]"><BookOpen className="h-5 w-5" /></span><span className="font-display text-2xl font-black">HQ READER</span></div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-[#ef233c]">{mode === 'login' ? 'Bem-vindo de volta' : 'Nova conta'}</p>
              <h2 className="mt-2 font-display text-4xl font-black uppercase tracking-wide">{mode === 'login' ? 'Entrar' : 'Criar acesso'}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{mode === 'login' ? 'Entre para abrir sua biblioteca e continuar de onde parou.' : 'Seu usuário será salvo no Supabase Auth e no perfil do HQ Reader.'}</p>
              {!auth.configured && <div className="mt-5 rounded-xl border border-[#ffd60a]/30 bg-[#ffd60a]/10 px-4 py-3 text-sm leading-6 text-[#ffd60a]">Supabase ainda não está configurado neste ambiente. Preencha <code className="font-bold">VITE_SUPABASE_URL</code> e <code className="font-bold">VITE_SUPABASE_PUBLISHABLE_KEY</code> no arquivo <code className="font-bold">.env</code> e reinicie o servidor.</div>}

              <div className="mt-7 grid grid-cols-2 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-1"><button type="button" onClick={() => setMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-black ${mode === 'login' ? 'bg-[#ef233c] text-white' : 'text-[var(--muted)]'}`}>Entrar</button><button type="button" onClick={() => setMode('signup')} className={`rounded-lg px-3 py-2.5 text-sm font-black ${mode === 'signup' ? 'bg-[#ef233c] text-white' : 'text-[var(--muted)]'}`}>Criar conta</button></div>

              <form className="mt-6 space-y-4" onSubmit={submit}>
                {mode === 'signup' && <Field label="Nome" icon={UserRound}><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" placeholder="Seu nome" className="w-full bg-transparent outline-none" /></Field>}
                <Field label="E-mail" icon={Mail}><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="voce@email.com" className="w-full bg-transparent outline-none" /></Field>
                <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--muted)]">Senha</span><span className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3.5"><LockKeyhole className="h-4 w-4 shrink-0 text-[var(--muted)]" /><input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" className="min-w-0 flex-1 bg-transparent outline-none" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[var(--muted)]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
                {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
                {message && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">{message}</div>}
                <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ef233c] px-4 py-3.5 text-sm font-black text-white shadow-[4px_4px_0_#ffd60a] transition hover:-translate-y-0.5 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'login' ? 'Entrar no HQ Reader' : 'Criar minha conta'}</button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({ label, icon: Icon, children }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--muted)]">{label}</span><span className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3.5"><Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />{children}</span></label>; }
