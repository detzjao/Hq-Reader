import { BookOpen, CheckCircle2, Download, FileArchive, FileText, Heart, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { localBridge } from '../services/localBridge.js';

function formatSize(bytes) {
  if (!Number(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes), index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function statusLabel(status, available) {
  if (available) return 'Pronta';
  return ({
    remote: 'Disponível',
    queued: 'Preparando',
    starting: 'Preparando',
    downloading: 'Baixando',
    verifying: 'Finalizando',
    error: 'Tente novamente',
    'offline-volume': 'Indisponível'
  })[status] || 'Disponível';
}

export default function LocalComicCard({ comic, favorite = false, readingState = null, onToggleFavorite, onChanged, allowDownload = true }) {
  const busy = ['queued', 'starting', 'downloading', 'verifying'].includes(comic.localStatus);
  const available = comic.localStatus === 'local' && comic.available;
  const pct = comic.size > 0 ? Math.max(0, Math.min(100, Math.round((comic.downloadedBytes || 0) / comic.size * 100))) : 0;
  const progress = readingState?.totalPages ? Math.round((readingState.lastPage || 1) * 100 / readingState.totalPages) : readingState?.completed ? 100 : null;
  const Icon = comic.format === 'pdf' ? FileText : FileArchive;
  const extension = String(comic.extension || comic.format || '').toUpperCase();
  const size = formatSize(comic.size);

  async function queue() {
    try { await localBridge.queueDownload(comic.id); onChanged?.(); }
    catch { window.alert('Não foi possível preparar esta HQ agora. Tente novamente em instantes.'); }
  }

  return (
    <article className="comic-card group overflow-hidden rounded-2xl">
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--panel-2)]">
        <div className="absolute inset-0 grid place-items-center text-[var(--muted)] opacity-35"><Icon className="h-16 w-16" strokeWidth={1.15} /></div>
        {available && <img src={localBridge.coverUrl(comic.id)} alt={`Capa de ${comic.name}`} loading="lazy" className="relative h-full w-full object-cover transition duration-500 group-hover:scale-[1.045]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black via-black/65 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {extension && <span className="hq-badge text-white">{extension}</span>}
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${available ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-300' : busy ? 'border-[#ffd60a]/35 bg-[#ffd60a]/15 text-[#ffd60a]' : 'border-white/15 bg-black/55 text-white'}`}>{statusLabel(comic.localStatus, available)}</span>
        </div>

        <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite?.(comic.id); }} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition ${favorite ? 'border-[#ef233c] bg-[#ef233c] text-white' : 'border-white/20 bg-black/55 text-white hover:bg-black/80'}`} aria-label={favorite ? 'Remover dos favoritos' : 'Favoritar'}><Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} /></button>

        <div className="absolute inset-x-3 bottom-3">
          <h2 className="line-clamp-2 font-display text-xl font-black leading-5 tracking-wide text-white" title={comic.name}>{String(comic.name || '').replace(/\.[^.]+$/, '')}</h2>
          <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-zinc-300"><span>Quadrinhos</span>{size && <span>{size}</span>}</div>
        </div>
      </div>

      {(busy || readingState?.started) && (
        <div className="h-1.5 bg-black/25">
          <div className={`h-full transition-all ${busy ? 'bg-[#ffd60a]' : readingState?.completed ? 'bg-emerald-500' : 'bg-[#ffd60a]'}`} style={{ width: `${busy ? (comic.localStatus === 'queued' ? 4 : pct) : (progress ?? 7)}%` }} />
        </div>
      )}

      <div className="p-3">
        {available ? (
          <Link to={`/comic/${encodeURIComponent(comic.id)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ef233c] px-3 py-2.5 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#ff3049]"><BookOpen className="h-4 w-4" /> {readingState?.started && !readingState?.completed ? 'Continuar' : 'Ver HQ'}</Link>
        ) : allowDownload ? (
          <button onClick={queue} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ffd60a] px-3 py-2.5 text-sm font-black text-black disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{busy ? `${pct}%` : 'Baixar'}</button>
        ) : (
          <button disabled className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 text-sm font-bold text-[var(--muted)]">Indisponível</button>
        )}
      </div>
    </article>
  );
}
