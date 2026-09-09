import { BookOpen, CheckCircle2, CloudDownload, Download, FileImage, FileText, Heart, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { isComicOffline, offlineEvents, removeComicOffline, saveComicOffline } from '../services/offline.js';

function formatSize(bytes) {
  if (!bytes) return 'Tamanho indisponível';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function readingLabel(readingState) {
  if (!readingState?.started) return '';
  if (readingState.completed) return 'Concluída';
  if (readingState.lastPage > 1) return `Em leitura · pág. ${readingState.lastPage}`;
  return 'Leitura iniciada';
}

function readingProgress(readingState) {
  if (!readingState?.started) return null;
  if (readingState.completed) return 100;
  const total = Number(readingState.totalPages || 0);
  if (!total) return null;
  const current = Math.min(total, Math.max(1, Number(readingState.lastPage || 1)));
  return Math.max(1, Math.min(99, Math.round((current / total) * 100)));
}

export default function ComicCard({ comic, favorite = false, readingState = null, onToggleFavorite }) {
  const isPdf = comic.format === 'pdf';
  const Icon = isPdf ? FileText : FileImage;
  const readerUrl = `/reader/${encodeURIComponent(comic.id)}`;
  const status = readingLabel(readingState);
  const progress = readingProgress(readingState);
  const [offline, setOffline] = useState(() => isComicOffline(comic.id));
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState('');

  useEffect(() => {
    const update = (event) => {
      if (!event?.detail?.id || String(event.detail.id) === String(comic.id)) setOffline(isComicOffline(comic.id));
    };
    const storage = (event) => {
      if (!event.key || event.key === offlineEvents.storageKey) setOffline(isComicOffline(comic.id));
    };
    window.addEventListener(offlineEvents.updated, update);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(offlineEvents.updated, update);
      window.removeEventListener('storage', storage);
    };
  }, [comic.id]);

  async function toggleOffline() {
    if (offlineBusy) return;
    setOfflineBusy(true);
    setOfflineProgress('');
    try {
      if (offline) {
        await removeComicOffline(comic.id);
      } else {
        await saveComicOffline(comic, {
          onProgress: ({ done, total, label }) => setOfflineProgress(total > 1 ? `${done}/${total}` : (label || ''))
        });
      }
      setOffline(isComicOffline(comic.id));
    } catch (error) {
      window.alert(error?.message || 'Não foi possível alterar a disponibilidade offline desta HQ.');
    } finally {
      setOfflineBusy(false);
      setOfflineProgress('');
    }
  }

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 shadow-xl shadow-black/10 transition duration-300 hover:-translate-y-1 hover:border-red-500/30 hover:bg-zinc-900 hover:shadow-glow">
      <button
        type="button"
        onClick={() => onToggleFavorite?.(comic.id)}
        className={`absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md transition ${favorite ? 'border-red-400/50 bg-red-500/90 text-white shadow-lg shadow-red-950/30' : 'border-white/15 bg-black/65 text-zinc-300 hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-300'}`}
        aria-label={favorite ? `Remover ${comic.name} dos favoritos` : `Favoritar ${comic.name}`}
        title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        <Heart className={`h-5 w-5 ${favorite ? 'fill-current' : ''}`} />
      </button>

      <Link to={readerUrl} className="block" aria-label={`Ler ${comic.name}`}>
        <div className="relative aspect-[2/3] overflow-hidden bg-zinc-900">
          <div className="absolute inset-0 grid place-items-center text-zinc-700">
            <Icon className="h-14 w-14" strokeWidth={1.2} />
          </div>
          {comic.thumbnailUrl && (
            <img
              src={api.assetUrl(comic.thumbnailUrl)}
              alt={`Capa de ${comic.name}`}
              loading="lazy"
              decoding="async"
              className="relative h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-zinc-950 to-transparent" />
          <span className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-200 backdrop-blur">
            {comic.extension}
          </span>
          {status && (
            <span className={`absolute bottom-3 right-3 flex max-w-[68%] items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold backdrop-blur ${readingState?.completed ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-300' : 'border-amber-400/25 bg-amber-500/15 text-amber-200'}`}>
              {readingState?.completed ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <BookOpen className="h-3 w-3 shrink-0" />}
              <span className="truncate">{status}</span>
            </span>
          )}
          {offline && (
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-sky-400/25 bg-sky-500/15 px-2 py-1 text-[10px] font-bold text-sky-200 backdrop-blur">
              <CheckCircle2 className="h-3 w-3" /> Offline
            </span>
          )}
        </div>

        {readingState?.started && (
          <div className="h-1.5 w-full bg-black/60" title={progress == null ? status : `${progress}% lido`}>
            <div
              className={`h-full transition-[width] duration-300 ${readingState.completed ? 'bg-emerald-500' : 'bg-red-500'}`}
              style={{ width: `${progress ?? 6}%` }}
            />
          </div>
        )}

        <div className="px-4 pt-4">
          <h2 className="line-clamp-2 min-h-12 text-[15px] font-semibold leading-6 text-zinc-100" title={comic.name}>
            {comic.name.replace(/\.[^.]+$/, '')}
          </h2>
          {comic.path && <div className="mt-1 truncate text-[11px] text-zinc-600" title={comic.path}>{comic.path}</div>}
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{formatSize(comic.size)}</span>
            {progress != null && (
              <span className={readingState?.completed ? 'font-bold text-emerald-400' : 'font-bold text-red-400'}>
                {progress}%
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-[1fr_auto_auto] gap-2 p-4 pt-3">
        <Link to={readerUrl} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-red-500">
          <BookOpen className="h-4 w-4" /> {readingState?.started && !readingState?.completed ? 'Continuar' : 'Ler'}
        </Link>
        <button
          type="button"
          onClick={toggleOffline}
          disabled={offlineBusy}
          className={`grid min-h-10 min-w-11 place-items-center rounded-xl border transition disabled:cursor-wait ${offline ? 'border-sky-400/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20' : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white'}`}
          aria-label={offline ? `Remover ${comic.name} do armazenamento offline` : `Salvar ${comic.name} para ler offline`}
          title={offlineBusy ? (offlineProgress || 'Salvando offline…') : (offline ? 'Remover do offline' : 'Salvar offline')}
        >
          {offlineBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : offline ? <CheckCircle2 className="h-4 w-4" /> : <CloudDownload className="h-4 w-4" />}
        </button>
        <a
          href={api.downloadUrl(comic.id)}
          download={comic.name}
          className="grid min-h-10 min-w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          aria-label={`Baixar ${comic.name}`}
          title="Baixar HQ"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}
