import { BookOpen, ChevronLeft, Heart, LayoutGrid, Library } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ComicGrid from '../components/ComicGrid.jsx';
import EmptyLibrary from '../components/EmptyLibrary.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import SearchBar from '../components/SearchBar.jsx';
import SeriesGrid from '../components/SeriesGrid.jsx';
import { api } from '../services/api.js';
import { getFavoriteIds, getReadingStates, libraryStateEvents, toggleFavorite } from '../services/libraryState.js';
import { groupComicsBySeries } from '../services/series.js';

const CATEGORY_ORDER = ['Marvel', 'DC Comics', 'Turma da Mônica', 'Outros'];
const FAVORITES_TAB = 'Favoritos';
const CONTINUE_TAB = 'Continuar lendo';
const AUTO_SYNC_SESSION_KEY = 'hq-reader:auto-drive-sync:v2.4';
const VIEW_STORAGE_KEY = 'hq-reader:home-view:v1';

function readingTime(state) {
  return Date.parse(state?.updatedAt || state?.startedAt || 0) || 0;
}

export default function Home() {
  const [comics, setComics] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem(VIEW_STORAGE_KEY) || 'series'; } catch { return 'series'; }
  });
  const [selectedSeriesKey, setSelectedSeriesKey] = useState('');
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
    try { localStorage.setItem(VIEW_STORAGE_KEY, viewMode); } catch {}
  }, [viewMode]);

  useEffect(() => {
    let active = true;
    load();

    async function syncPersonalStateOnStart() {
      try {
        await api.syncSharedUserState();
        if (active) refreshLocalState();
      } catch {
        // Sem rede/armazenamento, mantém o espelho local e tenta de novo depois.
      }
    }

    async function syncDrivesOnStart() {
      if (navigator.onLine === false) {
        if (active) setSyncing(false);
        return;
      }
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
        // A biblioteca atual continua utilizável e a próxima abertura tenta novamente.
      } finally {
        if (active) { setSyncing(false); setSyncProgress(''); }
      }
    }

    syncPersonalStateOnStart();
    syncDrivesOnStart();
    const handleLibraryUpdate = () => load({ silent: true });
    const handleLocalStateUpdate = () => { if (active) refreshLocalState(); };
    const handleSharedRefresh = () => {
      if (!active || navigator.onLine === false) return;
      api.syncSharedUserState().then(() => { if (active) refreshLocalState(); }).catch(() => {});
    };
    const handleStorage = (event) => {
      if (!event.key || event.key === libraryStateEvents.favoritesStorageKey || event.key.startsWith(libraryStateEvents.readingPrefix) || event.key.startsWith(libraryStateEvents.legacyProgressPrefix)) {
        handleLocalStateUpdate();
      }
    };
    window.addEventListener('hq-reader:library-updated', handleLibraryUpdate);
    window.addEventListener(libraryStateEvents.favorites, handleLocalStateUpdate);
    window.addEventListener(libraryStateEvents.reading, handleLocalStateUpdate);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('online', handleSharedRefresh);
    window.addEventListener('focus', handleSharedRefresh);
    return () => {
      active = false;
      window.removeEventListener('hq-reader:library-updated', handleLibraryUpdate);
      window.removeEventListener(libraryStateEvents.favorites, handleLocalStateUpdate);
      window.removeEventListener(libraryStateEvents.reading, handleLocalStateUpdate);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('online', handleSharedRefresh);
      window.removeEventListener('focus', handleSharedRefresh);
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

  const continueCount = useMemo(
    () => comics.reduce((count, comic) => {
      const state = readingStates[String(comic.id)];
      return count + (state?.started && !state?.completed ? 1 : 0);
    }, 0),
    [comics, readingStates]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const result = comics.filter((comic) => {
      const comicCategory = comic.category || comic.path?.split('/')[0] || 'Outros';
      const reading = readingStates[String(comic.id)];
      if (category === CONTINUE_TAB && (!reading?.started || reading?.completed)) return false;
      if (category === FAVORITES_TAB && !favoriteIds.has(String(comic.id))) return false;
      if (category !== 'Todas' && category !== FAVORITES_TAB && category !== CONTINUE_TAB && comicCategory !== category) return false;
      if (!query) return true;
      return `${comic.name} ${comic.path || ''} ${comicCategory}`.toLocaleLowerCase('pt-BR').includes(query);
    });

    if (category === CONTINUE_TAB) {
      return [...result].sort((a, b) => readingTime(readingStates[String(b.id)]) - readingTime(readingStates[String(a.id)]));
    }
    return result;
  }, [comics, search, category, favoriteIds, readingStates]);

  const seriesGroups = useMemo(() => groupComicsBySeries(filtered, readingStates), [filtered, readingStates]);
  const selectedSeries = useMemo(
    () => seriesGroups.find((series) => series.key === selectedSeriesKey) || null,
    [seriesGroups, selectedSeriesKey]
  );

  function handleToggleFavorite(id) {
    const favorite = toggleFavorite(id);
    setFavoriteIds(getFavoriteIds());
    api.setSharedFavorite(id, favorite).catch(() => {
      // A alteração já ficou enfileirada localmente para sincronizar depois.
    });
  }

  function chooseCategory(next) {
    setCategory(next);
    setSelectedSeriesKey('');
  }

  function changeSearch(value) {
    setSearch(value);
    setSelectedSeriesKey('');
  }

  function changeView(next) {
    setViewMode(next);
    setSelectedSeriesKey('');
  }

  const effectiveViewMode = category === CONTINUE_TAB ? 'comics' : viewMode;
  const showingSeries = effectiveViewMode === 'series' && !selectedSeries;
  const resultCount = showingSeries ? seriesGroups.length : (selectedSeries?.comics.length || filtered.length);

  return (
    <div className="min-h-screen">
      <Header onFocusSearch={() => searchRef.current?.focus()} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="mb-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-500">Biblioteca de HQs</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Sua biblioteca</h1>
            </div>
            {!loading && !error && (
              <p className="text-sm font-medium text-zinc-600">
                {syncing
                  ? `Sincronizando biblioteca completa${syncProgress ? ` · ${syncProgress}` : '…'}`
                  : `${comics.length} ${comics.length === 1 ? 'HQ' : 'HQs'}`}
              </p>
            )}
          </div>

          <SearchBar ref={searchRef} value={search} onChange={changeSearch} />

          {!loading && !error && (
            <>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => chooseCategory('Todas')} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${category === 'Todas' ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}>Todas <span className="ml-1 text-[10px] opacity-60">{comics.length}</span></button>
                <button type="button" onClick={() => chooseCategory(CONTINUE_TAB)} className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition ${category === CONTINUE_TAB ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}><BookOpen className="h-3.5 w-3.5" /> Continuar lendo <span className="text-[10px] opacity-60">{continueCount}</span></button>
                <button type="button" onClick={() => chooseCategory(FAVORITES_TAB)} className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition ${category === FAVORITES_TAB ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}><Heart className={`h-3.5 w-3.5 ${category === FAVORITES_TAB ? 'fill-current' : ''}`} /> Favoritos <span className="text-[10px] opacity-60">{favoriteCount}</span></button>
                {categories.map(([name, count]) => <button key={name} type="button" onClick={() => chooseCategory(name)} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${category === name ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}>{name} <span className="ml-1 text-[10px] opacity-60">{count}</span></button>)}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
                {category === CONTINUE_TAB ? (
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500"><BookOpen className="h-4 w-4 text-red-400" /> Ordenado pela leitura mais recente</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => changeView('series')} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${viewMode === 'series' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300'}`}><Library className="h-4 w-4" /> Séries</button>
                    <button type="button" onClick={() => changeView('comics')} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${viewMode === 'comics' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300'}`}><LayoutGrid className="h-4 w-4" /> HQs</button>
                  </div>
                )}
                <span className="text-xs font-medium text-zinc-600">{resultCount} {showingSeries ? (resultCount === 1 ? 'série' : 'séries') : (resultCount === 1 ? 'HQ' : 'HQs')}</span>
              </div>
            </>
          )}
        </section>

        {loading ? <Loading /> : error ? <ErrorMessage error={error} onRetry={() => load()} /> : selectedSeries ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="min-w-0">
                <button type="button" onClick={() => setSelectedSeriesKey('')} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-white"><ChevronLeft className="h-4 w-4" /> Voltar para séries</button>
                <h2 className="truncate text-xl font-black text-white">{selectedSeries.name}</h2>
                <p className="mt-1 truncate text-xs text-zinc-600">{selectedSeries.path} · {selectedSeries.comics.length} {selectedSeries.comics.length === 1 ? 'edição' : 'edições'}</p>
              </div>
            </div>
            <ComicGrid comics={selectedSeries.comics} favoriteIds={favoriteIds} readingStates={readingStates} onToggleFavorite={handleToggleFavorite} />
          </>
        ) : filtered.length ? (
          effectiveViewMode === 'series'
            ? <SeriesGrid series={seriesGroups} onOpen={(series) => setSelectedSeriesKey(series.key)} />
            : <ComicGrid comics={filtered} favoriteIds={favoriteIds} readingStates={readingStates} onToggleFavorite={handleToggleFavorite} />
        ) : <EmptyLibrary searching={Boolean(search) || category !== 'Todas'} />}
      </main>
    </div>
  );
}
