import { BookOpen, CheckCircle2, Download, LibraryBig, Menu, Search, Settings, SlidersHorizontal, Smartphone, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import LibraryManager from './LibraryManager.jsx';
import { canPromptInstall, isIOS, isStandalone, promptInstall, pwaEvents } from '../services/pwa.js';

export default function Header({ onFocusSearch }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('reading');
  const [defaultMode, setDefaultMode] = useState(() => localStorage.getItem('hq-reader:mode') || 'single');
  const [installReady, setInstallReady] = useState(() => canPromptInstall());
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    localStorage.setItem('hq-reader:mode', defaultMode);
  }, [defaultMode]);


  useEffect(() => {
    const updateInstall = () => {
      setInstallReady(canPromptInstall());
      setInstalled(isStandalone());
    };
    window.addEventListener(pwaEvents.install, updateInstall);
    window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', updateInstall);
    return () => {
      window.removeEventListener(pwaEvents.install, updateInstall);
      window.matchMedia?.('(display-mode: standalone)')?.removeEventListener?.('change', updateInstall);
    };
  }, []);

  async function installApp() {
    await promptInstall();
    setInstallReady(canPromptInstall());
    setInstalled(isStandalone());
  }

  useEffect(() => {
    if (!settingsOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

  function openSettings(tab = 'reading') {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  const settingsModal = settingsOpen ? createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Configurações do HQ Reader"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setSettingsOpen(false);
      }}
    >
      <div className="my-4 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/5 p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-500">HQ Reader</p>
            <h2 className="mt-2 text-xl font-bold text-white">Configurações</h2>
          </div>
          <button onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white" aria-label="Fechar configurações">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-white/5 px-5 sm:px-6">
          <button
            onClick={() => setSettingsTab('reading')}
            className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${settingsTab === 'reading' ? 'border-red-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            <SlidersHorizontal className="h-4 w-4" /> Leitura
          </button>
          <button
            onClick={() => setSettingsTab('library')}
            className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${settingsTab === 'library' ? 'border-red-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            <LibraryBig className="h-4 w-4" /> Biblioteca
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5 sm:p-6">
          {settingsTab === 'reading' ? (
            <div>
              <h3 className="text-lg font-bold text-white">Modo de leitura padrão</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Escolha como as HQs devem abrir por padrão.</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button onClick={() => setDefaultMode('single')} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${defaultMode === 'single' ? 'border-red-500/60 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
                  Página única
                </button>
                <button onClick={() => setDefaultMode('vertical')} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${defaultMode === 'vertical' ? 'border-red-500/60 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
                  Rolagem vertical
                </button>
              </div>

              <div className="mt-7 border-t border-white/5 pt-6">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-400"><Smartphone className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white">Aplicativo e leitura offline</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">Instale o HQ Reader como aplicativo. Nas capas, use o botão de nuvem para guardar uma HQ inteira neste dispositivo.</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  {installed ? (
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> HQ Reader instalado neste dispositivo.</div>
                  ) : installReady ? (
                    <button type="button" onClick={installApp} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500">
                      <Download className="h-4 w-4" /> Instalar HQ Reader
                    </button>
                  ) : isIOS() ? (
                    <p className="text-sm leading-6 text-zinc-300">No iPhone/iPad: toque em <span className="font-bold text-white">Compartilhar</span> e depois em <span className="font-bold text-white">Adicionar à Tela de Início</span>.</p>
                  ) : (
                    <p className="text-sm leading-6 text-zinc-400">Quando o navegador liberar a instalação, o botão aparecerá aqui. Também é possível usar a opção “Instalar aplicativo” no menu do navegador.</p>
                  )}
                  <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-zinc-500"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" /> HQs marcadas como offline continuam abrindo mesmo sem internet depois que o aplicativo tiver sido carregado pelo menos uma vez.</div>
                </div>
              </div>
            </div>
          ) : <LibraryManager />}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 font-black tracking-tight text-white" aria-label="HQ Reader - Biblioteca">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-600 shadow-glow">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>HQ READER</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            <Link to="/" className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white">
              Biblioteca
            </Link>
            <button onClick={onFocusSearch} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white">
              <Search className="h-4 w-4" /> Pesquisar
            </button>
            <button onClick={() => openSettings('library')} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white">
              <LibraryBig className="h-4 w-4" /> Adicionar HQs
            </button>
            <button onClick={() => openSettings('reading')} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white" aria-label="Configurações">
              <Settings className="h-4 w-4" /> Configurações
            </button>
          </nav>

          <div className="flex items-center gap-1 md:hidden">
            <button onClick={onFocusSearch} className="rounded-lg p-2 text-zinc-300 hover:bg-white/5" aria-label="Pesquisar HQ">
              <Search className="h-5 w-5" />
            </button>
            <button onClick={() => setMobileOpen((value) => !value)} className="rounded-lg p-2 text-zinc-300 hover:bg-white/5" aria-label="Abrir menu" aria-expanded={mobileOpen}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-white/5 bg-zinc-950 px-4 py-3 md:hidden" aria-label="Menu móvel">
            <Link to="/" className="block rounded-lg px-3 py-3 text-sm font-medium text-zinc-200" onClick={() => setMobileOpen(false)}>
              Biblioteca
            </Link>
            <button onClick={() => { openSettings('library'); setMobileOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium text-zinc-200">
              <LibraryBig className="h-4 w-4" /> Adicionar HQs
            </button>
            <button onClick={() => { openSettings('reading'); setMobileOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium text-zinc-200">
              <Settings className="h-4 w-4" /> Configurações
            </button>
          </nav>
        )}
      </header>
      {settingsModal}
    </>
  );
}
