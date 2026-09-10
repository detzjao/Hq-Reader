import { BookOpen, CheckCircle2, Download, Heart, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { api } from '../services/api.js';
import { getReadingState, isFavorite, saveReadingState, toggleFavorite } from '../services/libraryState.js';
import { isLocalComicId, localBridge } from '../services/localBridge.js';
import { seriesForComic } from '../services/series.js';

function cleanTitle(name = '') { return String(name || '').replace(/\.[^.]+$/, ''); }
function fmt(bytes) {
  if (!Number(bytes)) return 'Não informado';
  const units = ['B','KB','MB','GB']; let v=Number(bytes),i=0;
  while(v>=1024&&i<units.length-1){v/=1024;i+=1;} return `${v.toFixed(i?1:0)} ${units[i]}`;
}

export default function ComicDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const local = isLocalComicId(id);
  const [comic, setComic] = useState(null);
  const [related, setRelated] = useState([]);
  const [favorite, setFavorite] = useState(() => isFavorite(id));
  const [reading, setReading] = useState(() => getReadingState(id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      if (local) {
        const item = await localBridge.getComic(id);
        setComic(item);
      } else {
        const item = (await api.getComic(id)).comic;
        setComic(item);
        const all = (await api.getComics()).files || [];
        const info = seriesForComic(item);
        setRelated(all.filter((candidate) => candidate.id !== item.id && seriesForComic(candidate).key === info.key).sort((a, b) => new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare(a.name, b.name)).slice(0, 18));
      }
    } catch (e) { setError(local ? 'Não foi possível abrir esta HQ agora. Tente novamente em instantes.' : (e?.message || 'Não foi possível abrir esta HQ.')); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  const cover = useMemo(() => {
    if (!comic) return '';
    if (local) return comic.available ? localBridge.coverUrl(id) : '';
    return comic.thumbnailUrl || '';
  }, [comic, id, local]);

  function favoriteToggle() {
    const next = toggleFavorite(id);
    setFavorite(next);
    api.setSharedFavorite(id, next).catch(() => {});
  }

  function markRead() {
    const state = saveReadingState(id, { lastPage: Math.max(1, reading?.totalPages || 1), totalPages: reading?.totalPages || 1, completed: true });
    setReading(state);
    api.saveSharedReading(state).catch(() => {});
  }

  async function queueLocal() {
    setBusy(true);
    try { await localBridge.queueDownload(id); await load(); }
    catch { setError('Não foi possível preparar esta HQ agora. Tente novamente em instantes.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]"><Header /><div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[#ef233c]" /></div></div>;
  if (error && !comic) return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]"><Header /><main className="mx-auto max-w-4xl p-6"><button onClick={() => navigate('/')} className="mb-6 text-sm font-bold text-[var(--muted)]">← Biblioteca</button><div className="comic-panel rounded-2xl p-6 text-red-500">{error}</div></main></div>;

  const title = cleanTitle(comic.name);
  const canRead = !local || (comic.available && comic.localStatus === 'local');

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header />
      <main>
        <section className="relative isolate overflow-hidden border-b border-[var(--line)]">
          {cover && <div className="absolute inset-0 -z-20 bg-cover bg-center opacity-30 blur-2xl scale-110" style={{ backgroundImage: `url(${cover})` }} />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--bg)]/50 via-[var(--bg)]/85 to-[var(--bg)]" />
          <div className="halftone mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[280px_1fr] lg:px-8 lg:py-14">
            <div className="mx-auto w-full max-w-[280px]">
              <div className="comic-panel aspect-[2/3] overflow-hidden rounded-2xl bg-[var(--panel)]">{cover ? <img src={cover} alt={`Capa de ${title}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[var(--muted)]"><BookOpen className="h-20 w-20 opacity-30" /></div>}</div>
            </div>
            <div className="self-center">
              <div className="flex flex-wrap gap-2"><span className="hq-badge">{String(comic.extension || comic.format || '').toUpperCase()}</span>{reading?.completed && <span className="hq-badge text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Lida</span>}</div>
              <h1 className="mt-4 font-display text-5xl font-black uppercase leading-[.95] tracking-wide sm:text-6xl">{title}</h1>
              <p className="mt-3 text-sm font-semibold text-[var(--muted)]">{local ? 'Acervo digital' : (comic.path || comic.category || 'Sem coleção')}</p>
              <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Meta label="Editora" value={comic.publisher || comic.category} /><Meta label="Autor" value={comic.author || 'Não informado'} /><Meta label="Desenhista" value={comic.artist || 'Não informado'} /><Meta label="Ano" value={comic.year || 'Não informado'} /></div>
              <p className="mt-6 max-w-3xl text-sm leading-7 text-[var(--muted)]">{comic.synopsis || 'Sinopse ainda não cadastrada. Metadados complementares desta edição poderão ser adicionados posteriormente.'}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                {canRead ? <Link to={`/reader/${encodeURIComponent(id)}`} className="inline-flex items-center gap-2 rounded-xl bg-[#ef233c] px-5 py-3 text-sm font-black text-white shadow-[4px_4px_0_#ffd60a]"><BookOpen className="h-4 w-4" /> {reading?.started && !reading?.completed ? 'Continuar lendo' : 'Iniciar leitura'}</Link> : <button onClick={queueLocal} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#ffd60a] px-5 py-3 text-sm font-black text-black disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar para leitura</button>}
                <button onClick={favoriteToggle} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black ${favorite ? 'border-[#ef233c] bg-[#ef233c]/10 text-[#ef233c]' : 'border-[var(--line)] bg-[var(--panel)]'}`}><Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} /> {favorite ? 'Favoritada' : 'Favoritar'}</button>
                <button onClick={markRead} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm font-black"><CheckCircle2 className="h-4 w-4" /> Marcar como lida</button>
                {local && Number(comic.size) > 0 && <span className="inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm font-bold text-[var(--muted)]">{fmt(comic.size)}</span>}
              </div>
              {error && <div className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}
            </div>
          </div>
        </section>

        {!local && related.length > 0 && <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8"><div className="mb-5"><p className="text-xs font-black uppercase tracking-[.2em] text-[#ffd60a]">Coleção / saga</p><h2 className="font-display text-3xl font-black uppercase">Outras edições</h2></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{related.map((item) => <Link key={item.id} to={`/comic/${encodeURIComponent(item.id)}`} className="comic-card overflow-hidden rounded-2xl"><div className="aspect-[2/3] bg-[var(--panel-2)]">{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />}</div><div className="p-3"><div className="line-clamp-2 text-sm font-bold">{cleanTitle(item.name)}</div></div></Link>)}</div></section>}
      </main>
    </div>
  );
}

function Meta({ label, value }) { return <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]/80 p-3"><div className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--muted)]">{label}</div><div className="mt-1 truncate text-sm font-extrabold">{value || 'Não informado'}</div></div>; }
