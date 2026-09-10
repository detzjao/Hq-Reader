import { BookOpen, Cloud, HardDrive, Heart, LibraryBig, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ComicGrid from '../components/ComicGrid.jsx';
import EmptyLibrary from '../components/EmptyLibrary.jsx';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import LocalComicCard from '../components/LocalComicCard.jsx';
import { api } from '../services/api.js';
import { getFavoriteIds, getReadingStates, libraryStateEvents, toggleFavorite } from '../services/libraryState.js';
import { getLocalBridgeConfig, localBridge } from '../services/localBridge.js';

const CATEGORY_ORDER = ['Marvel', 'DC Comics', 'Turma da Mônica', 'Outros'];

export default function Home() {
  const [driveComics, setDriveComics] = useState([]);
  const [telegramItems, setTelegramItems] = useState([]);
  const [telegramTotal, setTelegramTotal] = useState(0);
  const [telegramPage, setTelegramPage] = useState(1);
  const [telegramPages, setTelegramPages] = useState(1);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [source, setSource] = useState('all');
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [favoriteIds, setFavoriteIds] = useState(() => getFavoriteIds());
  const [readingStates, setReadingStates] = useState({});
  const searchRef = useRef(null);

  async function loadDrive() {
    try {
      const result = await api.getComics();
      const files = result.files || [];
      setDriveComics(files);
      setWarning((result.warnings || []).join(' • '));
      setReadingStates(getReadingStates(files.map((item) => item.id)));
    } catch (error) {
      setWarning(error?.message || 'Não foi possível atualizar o catálogo do Drive.');
    }
  }

  async function loadTelegram({ q = search, page = telegramPage } = {}) {
    const cfg = getLocalBridgeConfig();
    if (!cfg.token) {
      setTelegramConnected(false);
      setTelegramItems([]);
      setTelegramTotal(0);
      return;
    }
    try {
      await localBridge.test();
      const result = await localBridge.catalog({ q, page, pageSize: 48 });
      setTelegramConnected(true);
      setTelegramItems(result.items || []);
      setTelegramTotal(Number(result.total || 0));
      setTelegramPages(Number(result.pages || 1));
    } catch {
      setTelegramConnected(false);
      setTelegramItems([]);
    }
  }

  async function load() {
    setLoading(true);
    await Promise.allSettled([loadDrive(), loadTelegram({ q: '', page: 1 })]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTelegramPage(1);
      if (source !== 'drive') loadTelegram({ q: search, page: 1 });
    }, 320);
    return () => clearTimeout(timer);
  }, [search, source]);
  useEffect(() => { if (source !== 'drive' && telegramConnected) loadTelegram({ q: search, page: telegramPage }); }, [telegramPage]);
  useEffect(() => {
    const refresh = () => { setFavoriteIds(getFavoriteIds()); setReadingStates(getReadingStates(driveComics.map((item) => item.id))); };
    window.addEventListener(libraryStateEvents.favorites, refresh);
    window.addEventListener(libraryStateEvents.reading, refresh);
    window.addEventListener('hq-reader:library-updated', loadDrive);
    window.addEventListener('hq-reader:local-bridge-config', () => loadTelegram({ q: search, page: 1 }));
    return () => {
      window.removeEventListener(libraryStateEvents.favorites, refresh);
      window.removeEventListener(libraryStateEvents.reading, refresh);
      window.removeEventListener('hq-reader:library-updated', loadDrive);
    };
  }, [driveComics, search]);

  const categories = useMemo(() => {
    const counts = new Map();
    for (const comic of driveComics) {
      const key = comic.category || 'Outros';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a[0]); const bi = CATEGORY_ORDER.indexOf(b[0]);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a[0].localeCompare(b[0], 'pt-BR');
    });
  }, [driveComics]);

  const filteredDrive = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return driveComics.filter((comic) => {
      if (source === 'telegram') return false;
      if (category === 'Favoritos' && !favoriteIds.has(String(comic.id))) return false;
      if (category !== 'Todas' && category !== 'Favoritos' && comic.category !== category) return false;
      if (!q) return true;
      return `${comic.name} ${comic.path || ''} ${comic.category || ''}`.toLocaleLowerCase('pt-BR').includes(q);
    });
  }, [driveComics, search, category, source, favoriteIds]);

  function handleFavorite(id) {
    const favorite = toggleFavorite(id);
    setFavoriteIds(getFavoriteIds());
    api.setSharedFavorite(id, favorite).catch(() => {});
  }

  const visibleDrive = source !== 'telegram';
  const visibleTelegram = source !== 'drive' && telegramConnected;
  const totalVisible = (visibleDrive ? filteredDrive.length : 0) + (visibleTelegram ? telegramTotal : 0);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header />
      <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="halftone relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-20 h-56 w-56 rotate-12 rounded-[3rem] bg-[#ef233c]/15" />
          <div className="relative max-w-4xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#ffd60a]/25 bg-[#ffd60a]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.16em] text-[#ffd60a]"><Sparkles className="h-3.5 w-3.5" /> Sua coleção</div>
            <h1 className="font-display text-5xl font-black uppercase leading-[.92] tracking-wide sm:text-6xl lg:text-7xl">Biblioteca</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">Google Drive e catálogo local do Telegram em uma única experiência. Pesquise uma vez e encontre a HQ onde ela estiver.</p>
          </div>

          <div className="relative mt-7 max-w-3xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar título, saga, coleção..." className="h-14 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--panel-2)] pl-12 pr-4 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[#00d4ff]" />
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            <button onClick={() => setSource('all')} className={`rounded-xl border px-3.5 py-2 text-xs font-extrabold ${source === 'all' ? 'border-[#ef233c] bg-[#ef233c] text-white' : 'border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]'}`}>Tudo</button>
            <button onClick={() => setSource('drive')} className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-extrabold ${source === 'drive' ? 'border-[#00d4ff] bg-[#00d4ff] text-black' : 'border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]'}`}><Cloud className="h-3.5 w-3.5" /> Google Drive</button>
            <button onClick={() => setSource('telegram')} className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-extrabold ${source === 'telegram' ? 'border-[#ffd60a] bg-[#ffd60a] text-black' : 'border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]'}`}><HardDrive className="h-3.5 w-3.5" /> Telegram {telegramConnected ? `(${telegramTotal.toLocaleString('pt-BR')})` : ''}</button>
          </div>
        </section>

        {!loading && (
          <section className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setCategory('Todas')} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${category === 'Todas' ? 'border-[#ef233c]/50 bg-[#ef233c]/10 text-[#ef233c]' : 'border-[var(--line)] text-[var(--muted)]'}`}>Todas</button>
              <button onClick={() => setCategory('Favoritos')} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold ${category === 'Favoritos' ? 'border-[#ef233c]/50 bg-[#ef233c]/10 text-[#ef233c]' : 'border-[var(--line)] text-[var(--muted)]'}`}><Heart className="h-3.5 w-3.5" /> Favoritos</button>
              {source !== 'telegram' && categories.map(([name, count]) => <button key={name} onClick={() => setCategory(name)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${category === name ? 'border-[#00d4ff]/50 bg-[#00d4ff]/10 text-[#00d4ff]' : 'border-[var(--line)] text-[var(--muted)]'}`}>{name} <span className="opacity-60">{count}</span></button>)}
            </div>
            <div className="text-xs font-semibold text-[var(--muted)]">{totalVisible.toLocaleString('pt-BR')} resultados</div>
          </section>
        )}

        {warning && <div className="mt-5 rounded-xl border border-[#ffd60a]/25 bg-[#ffd60a]/10 px-4 py-3 text-sm text-[#ffd60a]">{warning}</div>}

        {loading ? <div className="py-20"><Loading label="Abrindo biblioteca..." /></div> : (
          <div className="mt-7 space-y-12">
            {visibleDrive && (
              <section>
                <div className="mb-5 flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#00d4ff]">Google Drive</p><h2 className="font-display text-3xl font-black uppercase tracking-wide">Coleção principal</h2></div><span className="hq-badge text-[#00d4ff]">{filteredDrive.length.toLocaleString('pt-BR')} HQs</span></div>
                {filteredDrive.length ? <ComicGrid comics={filteredDrive} favoriteIds={favoriteIds} readingStates={readingStates} onToggleFavorite={handleFavorite} /> : <EmptyLibrary searching={Boolean(search) || category !== 'Todas'} />}
              </section>
            )}

            {visibleTelegram && (
              <section>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ffd60a]">Telegram + HDs locais</p><h2 className="font-display text-3xl font-black uppercase tracking-wide">Acervo sob demanda</h2></div><span className="hq-badge text-[#ffd60a]">{telegramTotal.toLocaleString('pt-BR')} arquivos</span></div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{telegramItems.map((comic) => <LocalComicCard key={comic.id} comic={comic} onChanged={() => loadTelegram({ q: search, page: telegramPage })} allowDownload />)}</div>
                {telegramPages > 1 && <div className="mt-7 flex items-center justify-center gap-3"><button disabled={telegramPage <= 1} onClick={() => setTelegramPage((p) => Math.max(1, p - 1))} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-bold disabled:opacity-30">Anterior</button><span className="text-sm font-bold text-[var(--muted)]">{telegramPage} / {telegramPages}</span><button disabled={telegramPage >= telegramPages} onClick={() => setTelegramPage((p) => Math.min(telegramPages, p + 1))} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-bold disabled:opacity-30">Próxima</button></div>}
              </section>
            )}

            {source !== 'drive' && !telegramConnected && (
              <section className="comic-panel rounded-2xl p-6"><div className="flex items-start gap-3"><HardDrive className="mt-1 h-5 w-5 text-[#ffd60a]" /><div><h3 className="font-display text-2xl font-black uppercase">Telegram local não conectado</h3><p className="mt-1 text-sm text-[var(--muted)]">A biblioteca continua funcionando pelo Google Drive. A conexão do Worker e o token são configurados exclusivamente no painel administrativo.</p></div></div></section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
