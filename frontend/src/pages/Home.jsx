import { useEffect, useMemo, useRef, useState } from 'react';
import ComicGrid from '../components/ComicGrid.jsx';
import EmptyLibrary from '../components/EmptyLibrary.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import SearchBar from '../components/SearchBar.jsx';
import { api } from '../services/api.js';

const CATEGORY_ORDER = ['Marvel', 'DC Comics', 'Turma da Mônica', 'Outros'];
const AUTO_SYNC_SESSION_KEY = 'hq-reader:auto-drive-sync';

export default function Home() {
  const [comics, setComics] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchRef = useRef(null);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getComics(silent);
      setComics(data.files || []);
    } catch (err) { setError(err); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    load();

    async function syncDrivesOnStart() {
      try {
        if (sessionStorage.getItem(AUTO_SYNC_SESSION_KEY) === '1') return;
        sessionStorage.setItem(AUTO_SYNC_SESSION_KEY, '1');
      } catch {}

      try {
        await api.syncLibrarySources();
        if (!active) return;
        const data = await api.getComics(true);
        if (active) setComics(data.files || []);
      } catch {
        // A biblioteca inicial continua utilizável mesmo se uma pasta pública estiver temporariamente indisponível.
      }
    }

    syncDrivesOnStart();
    const handleUpdate = () => load({ silent: true });
    window.addEventListener('hq-reader:library-updated', handleUpdate);
    return () => {
      active = false;
      window.removeEventListener('hq-reader:library-updated', handleUpdate);
    };
  }, []);

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

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return comics.filter((comic) => {
      const comicCategory = comic.category || comic.path?.split('/')[0] || 'Outros';
      if (category !== 'Todas' && comicCategory !== category) return false;
      if (!query) return true;
      return `${comic.name} ${comic.path || ''} ${comicCategory}`.toLocaleLowerCase('pt-BR').includes(query);
    });
  }, [comics, search, category]);

  return (
    <div className="min-h-screen">
      <Header onFocusSearch={() => searchRef.current?.focus()} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="mb-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.25em] text-red-500">Biblioteca de HQs</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Sua biblioteca</h1></div>
            {!loading && !error && <p className="text-sm font-medium text-zinc-600">{comics.length} {comics.length === 1 ? 'HQ' : 'HQs'}</p>}
          </div>
          <SearchBar ref={searchRef} value={search} onChange={setSearch} />
          {!loading && !error && categories.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setCategory('Todas')} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${category === 'Todas' ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}>Todas <span className="ml-1 text-[10px] opacity-60">{comics.length}</span></button>
              {categories.map(([name, count]) => <button key={name} type="button" onClick={() => setCategory(name)} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${category === name ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'}`}>{name} <span className="ml-1 text-[10px] opacity-60">{count}</span></button>)}
            </div>
          )}
        </section>
        {loading ? <Loading /> : error ? <ErrorMessage error={error} onRetry={() => load()} /> : filtered.length ? <ComicGrid comics={filtered} /> : <EmptyLibrary searching={Boolean(search) || category !== 'Todas'} />}
      </main>
    </div>
  );
}
