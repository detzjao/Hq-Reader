import { BookOpen, Library, LogOut, Menu, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

function themeFromStorage() {
  try { return localStorage.getItem('hq-reader:theme') || 'dark'; } catch { return 'dark'; }
}

export default function Header() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(themeFromStorage);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('hq-reader:theme', theme); } catch {}
  }, [theme]);

  async function logout() {
    await auth.signOut();
    navigate('/login', { replace: true });
  }

  const displayName = auth.profile?.display_name || auth.user?.email?.split('@')[0] || 'Usuário';
  const navClass = ({ isActive }) => `inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-extrabold transition ${isActive ? 'bg-[var(--panel-2)] text-[var(--text)] shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]'}`;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:var(--bg)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-3 text-[var(--text)]">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ef233c] text-white shadow-[4px_4px_0_rgba(255,214,10,.9)] transition group-hover:-translate-y-0.5"><BookOpen className="h-5 w-5" /></span>
          <span className="font-display text-2xl font-black tracking-wide">HQ READER</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={navClass}><Library className="h-4 w-4" /> Biblioteca</NavLink>
          {auth.isAdmin && <NavLink to="/admin" className={navClass}><ShieldCheck className="h-4 w-4 text-[#ef233c]" /> Admin</NavLink>}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button onClick={() => setTheme((v) => v === 'dark' ? 'light' : 'dark')} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] transition hover:-translate-y-0.5 hover:text-[var(--text)]" title="Alternar tema">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)]">
            <span className="font-extrabold text-[var(--text)]">{displayName}</span>{auth.isAdmin && <span className="ml-2 font-bold text-[#ef233c]">Admin</span>}
          </div>
          <button onClick={logout} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-400" title="Sair"><LogOut className="h-4 w-4" /></button>
        </div>

        <button onClick={() => setMobileOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--panel)] text-[var(--text)] md:hidden">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>

      {mobileOpen && (
        <div className="border-t border-[var(--line)] bg-[var(--bg)] px-4 py-4 md:hidden">
          <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-xs text-[var(--muted)]"><strong className="text-[var(--text)]">{displayName}</strong><div>{auth.user?.email}</div></div>
          <NavLink to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-3 font-bold text-[var(--text)]"><Library className="h-4 w-4" /> Biblioteca</NavLink>
          {auth.isAdmin && <NavLink to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-3 font-bold text-[#ef233c]"><ShieldCheck className="h-4 w-4" /> Painel administrativo</NavLink>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => setTheme((v) => v === 'dark' ? 'light' : 'dark')} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm font-bold text-[var(--text)]">{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
            <button onClick={logout} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm font-bold text-red-400">Sair</button>
          </div>
        </div>
      )}
    </header>
  );
}
