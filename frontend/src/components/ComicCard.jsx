import { BookOpen, CheckCircle2, CloudDownload, FileArchive, FileImage, FileText, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

function formatSize(bytes) {
  if (!Number(bytes)) return 'Tamanho não informado';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes), index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function ComicCard({ comic, favorite = false, readingState = null, onToggleFavorite }) {
  const Icon = comic.format === 'pdf' ? FileText : comic.format === 'image' ? FileImage : FileArchive;
  const progress = readingState?.totalPages ? Math.round((readingState.lastPage || 1) * 100 / readingState.totalPages) : readingState?.completed ? 100 : null;
  const detailUrl = `/comic/${encodeURIComponent(comic.id)}`;

  return (
    <article className="comic-card group overflow-hidden rounded-2xl">
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--panel-2)]">
        <div className="absolute inset-0 grid place-items-center text-[var(--muted)] opacity-35"><Icon className="h-16 w-16" strokeWidth={1.15} /></div>
        {comic.thumbnailUrl && (
          <img src={api.assetUrl(comic.thumbnailUrl)} alt={`Capa de ${comic.name}`} loading="lazy" decoding="async" className="relative h-full w-full object-cover transition duration-500 group-hover:scale-[1.045]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black via-black/65 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className={`hq-badge ${comic.sourceType === 'drive' ? 'text-[#00d4ff]' : 'text-[#ffd60a]'}`}>{comic.sourceType === 'drive' ? 'Drive' : comic.sourceType === 'local-telegram' ? 'Telegram' : comic.sourceType}</span>
          <span className="hq-badge text-white">{String(comic.extension || comic.format || '').toUpperCase()}</span>
        </div>

        <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite?.(comic.id); }} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition ${favorite ? 'border-[#ef233c] bg-[#ef233c] text-white' : 'border-white/20 bg-black/55 text-white hover:bg-black/80'}`} aria-label={favorite ? 'Remover dos favoritos' : 'Favoritar'}><Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} /></button>

        <div className="absolute inset-x-3 bottom-3">
          <h2 className="line-clamp-2 font-display text-xl font-black leading-5 tracking-wide text-white" title={comic.name}>{String(comic.name || '').replace(/\.[^.]+$/, '')}</h2>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-zinc-300"><span className="truncate">{comic.category || 'Outros'}</span><span className="shrink-0">{formatSize(comic.size)}</span></div>
        </div>
      </div>

      {readingState?.started && (
        <div className="h-1.5 bg-black/25">
          <div className={`h-full transition-all ${readingState.completed ? 'bg-emerald-500' : 'bg-[#ffd60a]'}`} style={{ width: `${progress ?? 7}%` }} />
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2 p-3">
        <Link to={detailUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ef233c] px-3 py-2.5 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#ff3049]">
          <BookOpen className="h-4 w-4" /> {readingState?.started && !readingState?.completed ? 'Continuar' : 'Ver HQ'}
        </Link>
        <Link to={detailUrl} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]" title={readingState?.completed ? 'Lida' : 'Detalhes'}>{readingState?.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CloudDownload className="h-4 w-4" />}</Link>
      </div>
    </article>
  );
}
