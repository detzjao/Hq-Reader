import { BookMarked, BookOpen, CheckCircle2, Heart, LibraryBig, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ComicCard from '../components/ComicCard.jsx';
import EmptyLibrary from '../components/EmptyLibrary.jsx';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import LocalComicCard from '../components/LocalComicCard.jsx';
import { api } from '../services/api.js';
import {
  getAllReadingStates,
  getFavoriteIds,
  libraryStateEvents,
  toggleFavorite
} from '../services/libraryState.js';
import { getLocalBridgeConfig, isLocalComicId, localBridge } from '../services/localBridge.js';

const COLLECTION_ORDER = ['Marvel', 'DC Comics', 'Turma da Mônica', 'Outros'];
const PAGE_SIZE_PER_CATALOG = 30;

const USER_FILTERS = [
  { id: 'Todas', label: 'Todos', icon: LibraryBig },
  { id: 'Continuar', label: 'Continuar lendo', icon: BookOpen },
  { id: 'Favoritos', label: 'Favoritas', icon: Heart },
  { id: 'Concluidas', label: 'Concluídas', icon: CheckCircle2 }
];

function matchesUserFilter(id, filter, favoriteIds, readingStates) {
  const key = String(id);
  const state = readingStates[key];
  if (filter === 'Favoritos') return favoriteIds.has(key);
  if (filter === 'Continuar') return Boolean(state?.started && !state?.completed);
  if (filter === 'Concluidas') return Boolean(state?.completed);
  return true;
}

function LibraryCard({ comic, favoriteIds, readingStates, onToggleFavorite, onLocalChanged }) {
  const favorite = favoriteIds.has(String(comic.id));
  const readingState = readingStates[String(comic.id)] || null;
  if (isLocalComicId(comic.id) || comic.sourceType === 'local-telegram') {
    return (
      <LocalComicCard
        comic={comic}
        favorite={favorite}
        readingState={readingState}
        onToggleFavorite={onToggleFavorite}
        onChanged={onLocalChanged}
        allowDownload
      />
    );
  }
  return <ComicCard comic={comic} favorite={favorite} readingState={readingState} onToggleFavorite={onToggleFavorite} />;
}

function Shelf({ eyebrow, title, items, favoriteIds, readingStates, onToggleFavorite, onLocalChanged }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#ffd60a]">{eyebrow}</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-wide">{title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {items.slice(0, 8).map((comic) => (
          <LibraryCard
            key={comic.id}
            comic={comic}
            favoriteIds={favoriteIds}
            readingStates={readingStates}
            onToggleFavorite={onToggleFavorite}
            onLocalChanged={onLocalChanged}
          />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [driveComics, setDriveComics] = useState([]);
  const [localItems, setLocalItems] = useState([]);
  const [localStateItems, setLocalStateItems] = useState([]);
  const [localTotal, setLocalTotal] = useState(0);
  const [localPages, setLocalPages] = useState(1);
  const [localAvailable, setLocalAvailable] = useState(false);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('Todas');
  const [collection, setCollection] = useState('Todas');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [favoriteIds, setFavoriteIds] = useState(() => getFavoriteIds());
  const [readingStates, setReadingStates] = useState(() => getAllReadingStates());
  const searchRef = useRef(null);

  function refreshPersonalState() {
    setFavoriteIds(getFavoriteIds());
    setReadingStates(getAllReadingStates());
  }

  async function loadDrive() {
    try {
      const result = await api.getComics();
      setDriveComics(result.files || []);
      return true;
    } catch {
      return false;
    }
  }

  async function loadLocalCatalog({ q = search, currentPage = page } = {}) {
    const cfg = getLocalBridgeConfig();
    if (!cfg.token) {
      setLocalAvailable(false);
      setLocalItems([]);
      setLocalTotal(0);
      setLocalPages(1);
      return false;
    }
    try {
      await localBridge.test();
      const result = await localBridge.catalog({ q, page: currentPage, pageSize: PAGE_SIZE_PER_CATALOG });
      setLocalAvailable(true);
      setLocalItems(result.items || []);
      setLocalTotal(Number(result.total || 0));
      setLocalPages(Number(result.pages || 1));
      return true;
    } catch {
      // A indisponibilidade da infraestrutura local é assunto do Admin.
      // Para o usuário, a biblioteca continua funcionando normalmente com
      // todo o conteúdo que estiver acessível pelas demais fontes.
      setLocalAvailable(false);
      setLocalItems([]);
      setLocalTotal(0);
      setLocalPages(1);
      return false;
    }
  }

  async function loadLocalPersonalItems(favorites = favoriteIds, states = readingStates) {
    const cfg = getLocalBridgeConfig();
    if (!cfg.token) {
      setLocalStateItems([]);
      return;
    }

    const ids = new Set();
    for (const id of favorites) if (isLocalComicId(id)) ids.add(String(id));
    for (const id of Object.keys(states || {})) if (isLocalComicId(id)) ids.add(String(id));
    if (!ids.size) {
      setLocalStateItems([]);
      return;
    }

    const results = await Promise.allSettled([...ids].slice(0, 120).map((id) => localBridge.getComic(id)));
    setLocalStateItems(results.filter((entry) => entry.status === 'fulfilled' && entry.value).map((entry) => entry.value));
  }

  async function load() {
    setLoading(true);
    setMessage('');

    await api.syncSharedUserState().catch(() => null);
    const nextFavorites = getFavoriteIds();
    const nextReading = getAllReadingStates();
    setFavoriteIds(nextFavorites);
    setReadingStates(nextReading);

    const [driveResult] = await Promise.allSettled([
      loadDrive(),
      loadLocalCatalog({ q: '', currentPage: 1 }),
      loadLocalPersonalItems(nextFavorites, nextReading)
    ]);

    if (driveResult.status === 'fulfilled' && driveResult.value === false && !localAvailable) {
      setMessage('Não foi possível atualizar toda a biblioteca agora. Tente novamente em instantes.');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      if (collection === 'Todas' && userFilter === 'Todas') loadLocalCatalog({ q: search, currentPage: 1 });
    }, 320);
    return () => clearTimeout(timer);
  }, [search, collection, userFilter]);

  useEffect(() => {
    if (collection === 'Todas' && userFilter === 'Todas' && localAvailable) {
      loadLocalCatalog({ q: search, currentPage: page });
    }
  }, [page]);

  useEffect(() => {
    const refresh = () => {
      const nextFavorites = getFavoriteIds();
      const nextReading = getAllReadingStates();
      setFavoriteIds(nextFavorites);
      setReadingStates(nextReading);
      loadLocalPersonalItems(nextFavorites, nextReading).catch(() => {});
    };
    const localConfigChanged = () => {
      loadLocalCatalog({ q: search, currentPage: 1 });
      loadLocalPersonalItems().catch(() => {});
    };
    window.addEventListener(libraryStateEvents.favorites, refresh);
    window.addEventListener(libraryStateEvents.reading, refresh);
    window.addEventListener('hq-reader:library-updated', loadDrive);
    window.addEventListener('hq-reader:local-bridge-config', localConfigChanged);
    return () => {
      window.removeEventListener(libraryStateEvents.favorites, refresh);
      window.removeEventListener(libraryStateEvents.reading, refresh);
      window.removeEventListener('hq-reader:library-updated', loadDrive);
      window.removeEventListener('hq-reader:local-bridge-config', localConfigChanged);
    };
  }, [search, page]);

  const collections = useMemo(() => {
    const counts = new Map();
    for (const comic of driveComics) {
      const key = comic.category || 'Outros';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
      const ai = COLLECTION_ORDER.indexOf(a[0]);
      const bi = COLLECTION_ORDER.indexOf(b[0]);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a[0].localeCompare(b[0], 'pt-BR');
    });
  }, [driveComics]);

  const filteredDrive = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return driveComics.filter((comic) => {
      if (collection !== 'Todas' && (comic.category || 'Outros') !== collection) return false;
      if (!matchesUserFilter(comic.id, userFilter, favoriteIds, readingStates)) return false;
      if (!q) return true;
      return `${comic.name} ${comic.path || ''} ${comic.category || ''}`.toLocaleLowerCase('pt-BR').includes(q);
    });
  }, [driveComics, search, collection, userFilter, favoriteIds, readingStates]);

  const personalLocal = useMemo(() => {
    if (collection !== 'Todas') return [];
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return localStateItems.filter((comic) => {
      if (!matchesUserFilter(comic.id, userFilter, favoriteIds, readingStates)) return false;
      if (!q) return true;
      return `${comic.name || ''}`.toLocaleLowerCase('pt-BR').includes(q);
    });
  }, [localStateItems, search, collection, userFilter, favoriteIds, readingStates]);

  const continueItems = useMemo(() => {
    const candidates = [...driveComics, ...localStateItems];
    return candidates
      .filter((comic) => {
        const state = readingStates[String(comic.id)];
        return state?.started && !state?.completed;
      })
      .sort((a, b) => {
        const ad = Date.parse(readingStates[String(a.id)]?.updatedAt || 0) || 0;
        const bd = Date.parse(readingStates[String(b.id)]?.updatedAt || 0) || 0;
        return bd - ad;
      });
  }, [driveComics, localStateItems, readingStates]);

  const favoriteItems = useMemo(() => {
    return [...driveComics, ...localStateItems].filter((comic) => favoriteIds.has(String(comic.id)));
  }, [driveComics, localStateItems, favoriteIds]);

  const drivePages = Math.max(1, Math.ceil(filteredDrive.length / PAGE_SIZE_PER_CATALOG));
  const drivePageItems = filteredDrive.slice((page - 1) * PAGE_SIZE_PER_CATALOG, page * PAGE_SIZE_PER_CATALOG);

  let browseItems = [];
  let totalResults = filteredDrive.length;
  let totalPages = drivePages;

  if (userFilter === 'Todas') {
    const localBrowse = collection === 'Todas' && localAvailable ? localItems : [];
    browseItems = [...drivePageItems, ...localBrowse];
    totalResults += collection === 'Todas' && localAvailable ? localTotal : 0;
    totalPages = Math.max(drivePages, collection === 'Todas' && localAvailable ? localPages : 1);
  } else {
    const combined = [...filteredDrive, ...personalLocal];
    totalResults = combined.length;
    totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE_PER_CATALOG));
    browseItems = combined.slice((page - 1) * PAGE_SIZE_PER_CATALOG, page * PAGE_SIZE_PER_CATALOG);
  }

  function changeUserFilter(next) {
    setUserFilter(next);
    setPage(1);
  }

  function changeCollection(next) {
    setCollection(next);
    setPage(1);
  }

  function handleFavorite(id) {
    const favorite = toggleFavorite(id);
    refreshPersonalState();
    api.setSharedFavorite(id, favorite).catch(() => {});
  }

  function handleLocalChanged() {
    loadLocalCatalog({ q: search, currentPage: page });
    loadLocalPersonalItems().catch(() => {});
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header />
      <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="halftone relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-20 h-56 w-56 rotate-12 rounded-[3rem] bg-[#ef233c]/15" />
          <div className="relative max-w-4xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#ffd60a]/25 bg-[#ffd60a]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.16em] text-[#ffd60a]"><Sparkles className="h-3.5 w-3.5" /> Sua coleção</div>
            <h1 className="font-display text-5xl font-black uppercase leading-[.92] tracking-wide sm:text-6xl lg:text-7xl">Biblioteca</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">Continue suas leituras, reencontre suas favoritas e descubra novas histórias em um único lugar.</p>
          </div>

          <div className="relative mt-7 max-w-3xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar título, saga ou coleção..." className="h-14 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--panel-2)] pl-12 pr-4 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[#00d4ff]" />
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            {USER_FILTERS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => changeUserFilter(id)} className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${userFilter === id ? 'border-[#ef233c] bg-[#ef233c] text-white' : 'border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]'}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </section>

        {!loading && collections.length > 0 && (
          <section className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => changeCollection('Todas')} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${collection === 'Todas' ? 'border-[#00d4ff]/50 bg-[#00d4ff]/10 text-[#00d4ff]' : 'border-[var(--line)] text-[var(--muted)]'}`}>Todas as coleções</button>
              {collections.map(([name, count]) => (
                <button key={name} onClick={() => changeCollection(name)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${collection === name ? 'border-[#00d4ff]/50 bg-[#00d4ff]/10 text-[#00d4ff]' : 'border-[var(--line)] text-[var(--muted)]'}`}>
                  {name} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {message && <div className="mt-5 rounded-xl border border-[#ffd60a]/25 bg-[#ffd60a]/10 px-4 py-3 text-sm text-[#ffd60a]">{message}</div>}

        {loading ? (
          <div className="py-20"><Loading label="Abrindo biblioteca..." /></div>
        ) : (
          <div className="mt-9 space-y-14">
            {userFilter === 'Todas' && !search && collection === 'Todas' && (
              <>
                <Shelf eyebrow="Retome sua história" title="Continuar lendo" items={continueItems} favoriteIds={favoriteIds} readingStates={readingStates} onToggleFavorite={handleFavorite} onLocalChanged={handleLocalChanged} />
                <Shelf eyebrow="Sua seleção" title="Favoritas" items={favoriteItems} favoriteIds={favoriteIds} readingStates={readingStates} onToggleFavorite={handleFavorite} onLocalChanged={handleLocalChanged} />
              </>
            )}

            <section>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.2em] text-[#00d4ff]">Acervo</p>
                  <h2 className="font-display text-3xl font-black uppercase tracking-wide">{userFilter === 'Todas' ? 'Explorar biblioteca' : USER_FILTERS.find((item) => item.id === userFilter)?.label}</h2>
                </div>
                <span className="hq-badge text-[#00d4ff]">{totalResults.toLocaleString('pt-BR')} títulos</span>
              </div>

              {browseItems.length ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {browseItems.map((comic) => (
                    <LibraryCard
                      key={comic.id}
                      comic={comic}
                      favoriteIds={favoriteIds}
                      readingStates={readingStates}
                      onToggleFavorite={handleFavorite}
                      onLocalChanged={handleLocalChanged}
                    />
                  ))}
                </div>
              ) : (
                <EmptyLibrary searching={Boolean(search) || userFilter !== 'Todas' || collection !== 'Todas'} />
              )}

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-bold disabled:opacity-30">Anterior</button>
                  <span className="text-sm font-bold text-[var(--muted)]">{page.toLocaleString('pt-BR')} / {totalPages.toLocaleString('pt-BR')}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-bold disabled:opacity-30">Próxima</button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
