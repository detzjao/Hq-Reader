import { Heart } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ComicGrid from '../components/ComicGrid.jsx';
import EmptyLibrary from '../components/EmptyLibrary.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import SearchBar from '../components/SearchBar.jsx';
import { api } from '../services/api.js';
import { getFavoriteIds, getReadingStates, libraryStateEvents, toggleFavorite } from '../services/libraryState.js';

const CATEGORY_ORDER = ['Marvel', 'DC Comics', 'Turma da Mônica', 'Outros'];
const FAVORITES_TAB = 'Favoritos';
const AUTO_SYNC_SESSION_KEY = 'hq-reader:auto-drive-sync:v2.3';

export default function Home() {
  const [comics, setComics] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [syncProgress, setSyncProgress] = useState('');
  const [favoriteIds, setFavoriteIds] = useState(() => getFavoriteIds());
  const [readingStates, setReadingStates] = useState({});
  const searchRef = useRef(null);
  const comicsRef = useRef([]);

  function refreshLocalState(nextComics = comicsRef.current) {
    setFavoriteIds(getFavoriteIds());
    setReadingStates(getReadingStates((nextComics || []).map((comic) => comic.id)));
  }

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getComics(silent);
      const files = data.files || [];
      comicsRef.current = files;
      setComics(files);
      refreshLocalState(files);
    } catch (err) { setError(err); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    load();

    async function syncDrivesOnStart() {
      try {
        if (sessionStorage.getItem(AUTO_SYNC_SESSION_KEY) === '1') {
          if (active) setSyncing(false);
          return;
        }
      } catch {}

      try {
        if (active) setSyncing(true);
        const sync = await api.syncLibrarySources({
          onProgress: async ({ source, index, totalSources }) => {
            if (!active) return;
            setSyncProgress(`${source?.label || 'Drive'} · ${index + 1}/${totalSources}`);
            try {
              const data = await api.getComics(true);
              if (active) {
                const files = data.files || [];
                comicsRef.current = files;
                setComics(files);
                refreshLocalState(files);
              }
            } catch {}
          }
        });
        if (!active) return;
        const data = await api.getComics(true);
        if (active) {
          const files = data.files || [];
          comicsRef.current = files;
          setComics(files);
          refreshLocalState(files);
        }
        if (!sync?.partial) {
          try { sessionStorage.setItem(AUTO_SYNC_SESSION_KEY, '1'); } catch {}
        }
      } catch {
        // A biblioteca inicial continua utilizável e a próxima abertura tenta novamente.
      } finally {
        if (active) { setSyncing(false); setSyncProgress(''); }
      }
    }

    syncDrivesOnStart();
    const handleLibraryUpdate = () => load({ silent: true });
    const handleLocalStateUpdate = () => { if (active) refreshLocalState(); };
    const handleStorage = (event) => {
      if (!event.key || event.key === libraryStateEvents.favoritesStorageKey || event.key.startsWith(libraryStateEvents.readingPrefix) || event.key.startsWith(libraryStateEvents.legacyProgressPrefix)) {
        handleLocalStateUpdate();
      }
    };
    window.addEventListener('hq-reader:library-updated', handleLibraryUpdate);
    window.addEventListener(libraryStateEvents.favorites, handleLocalStateUpdate);
    window.addEventListener(libraryStateEvents.reading, handleLocalStateUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      active = false;
      window.removeEventListener('hq-reader:library-updated', handleLibraryUpdate);
      window.removeEventListener(libraryStateEvents.favorites, handleLocalStateUpdate);
      window.removeEventListener(libraryStateEvents.reading, handleLocalStateUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    setReadingStates(getReadingStates(comics.map((comic) => comic.id)));
  }, [comics]);

  const categories = useMemo(() => {
    const counts = new Map();
    for (const comic of comics) {
      const value = comic.category || comic.path?.split('/')[0] || 'Outros';
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a[0]);
      const bi = CATEGORY_ORDER.indexOf(b[0]);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a[0].localeCompare(b[0], 'pt-BR');
    });
  }, [comics]);

  const favoriteCount = useMemo(
    () => comics.reduce((count, comic) => count + (favoriteIds.has(String(comic.id)) ? 1 : 0), 0),
    [comics, favoriteIds]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return comics.filter((comic) => {
      const comicCategory = comic.category || comic.path?.split('/')[0] || 'Outros';
      if (category === FAVORITES_TAB && !favoriteIds.has(String(comic.id))) return false;
      if (category !== 'Todas' && category !== FAVORITES_TAB && comicCategory !== category) return false;
      if (!query) return true;
      return `${comic.name} ${comic.path || ''} ${comicCategory}`.toLocaleLowerCase('pt-BR').includes(query);
    });
  }, [comics, search, category, favoriteIds]);

  function handleToggleFavorite(id) {
    toggleFavorite(id);
    setFavoriteIds(getFavoriteIds());
  }

  return (
    <div className="min-h-screen">
      <Header onFocusSearch={() => searchRef.current?.focus()} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="mb-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.25em] text-red-500">Biblioteca de HQs</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Sua biblioteca</h1></div>
            {!loading && !error && (
              <p className="text-sm font-medium text-zinc-600">
                {syncing
                  ? `Sincronizando biblioteca completa${syncProgress ? ` · ${syncProgress}` : '…'}`
                  : `${comics.length} ${comics.length === 1 ? 'HQ' : 'HQs'}`}
              </p>
            )}
          </div>
          <SearchBar ref={searchRef} value={search} onChange={setSearch} />
          {!loading && !error && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setCategory('Todas')} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${category === 'Todas' ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}>Todas <span className="ml-1 text-[10px] opacity-60">{comics.length}</span></button>
              <button type="button" onClick={() => setCategory(FAVORITES_TAB)} className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition ${category === FAVORITES_TAB ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}><Heart className={`h-3.5 w-3.5 ${category === FAVORITES_TAB ? 'fill-current' : ''}`} /> Favoritos <span className="text-[10px] opacity-60">{favoriteCount}</span></button>
              {categories.map(([name, count]) => <button key={name} type="button" onClick={() => setCategory(name)} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${category === name ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}>{name} <span className="ml-1 text-[10px] opacity-60">{count}</span></button>)}
            </div>
          )}
        </section>
        {loading ? <Loading /> : error ? <ErrorMessage error={error} onRetry={() => load()} /> : filtered.length ? <ComicGrid comics={filtered} favoriteIds={favoriteIds} readingStates={readingStates} onToggleFavorite={handleToggleFavorite} /> : <EmptyLibrary searching={Boolean(search) || category !== 'Todas'} />}
      </main>
    </div>
  );
}
