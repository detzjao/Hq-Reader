import { BookOpen, Download, FileArchive, FileText, HardDrive, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { localBridge } from '../services/localBridge.js';

function formatSize(bytes) {
  if (!Number(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes), index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function statusLabel(status) {
  return ({ remote: 'No Telegram', queued: 'Na fila', starting: 'Iniciando', downloading: 'Baixando', verifying: 'Verificando', local: 'No HD', error: 'Erro', 'offline-volume': 'HD desconectado' })[status] || status;
}

export default function LocalComicCard({ comic, onChanged, allowDownload = true }) {
  const busy = ['queued', 'starting', 'downloading', 'verifying'].includes(comic.localStatus);
  const available = comic.localStatus === 'local' && comic.available;
  const pct = comic.size > 0 ? Math.max(0, Math.min(100, Math.round((comic.downloadedBytes || 0) / comic.size * 100))) : 0;
  const Icon = comic.format === 'pdf' ? FileText : FileArchive;
  async function queue() {
    try { await localBridge.queueDownload(comic.id); onChanged?.(); }
    catch (e) { window.alert(e?.message || 'Não foi possível iniciar o download.'); }
  }

  return (
    <article className="comic-card group overflow-hidden rounded-2xl">
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--panel-2)]">
        <div className="absolute inset-0 grid place-items-center text-[var(--muted)] opacity-35"><Icon className="h-16 w-16" strokeWidth={1.15} /></div>
        {available && <img src={localBridge.coverUrl(comic.id)} alt={`Capa de ${comic.name}`} loading="lazy" className="relative h-full w-full object-cover transition duration-500 group-hover:scale-[1.045]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black via-black/65 to-transparent" />
        <span className="hq-badge absolute left-3 top-3 text-[#ffd60a]">Telegram</span>
        <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${available ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-300' : busy ? 'border-[#ffd60a]/35 bg-[#ffd60a]/15 text-[#ffd60a]' : 'border-white/15 bg-black/55 text-white'}`}>{statusLabel(comic.localStatus)}</span>
        <div className="absolute inset-x-3 bottom-3">
          <h2 className="line-clamp-2 font-display text-xl font-black leading-5 tracking-wide text-white" title={comic.name}>{String(comic.name || '').replace(/\.[^.]+$/, '')}</h2>
          <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-zinc-300"><span>{String(comic.extension || '').toUpperCase()}</span><span>{formatSize(comic.size)}</span></div>
        </div>
      </div>
      {busy && <div className="h-1.5 bg-black/25"><div className="h-full bg-[#ffd60a]" style={{ width: `${comic.localStatus === 'queued' ? 4 : pct}%` }} /></div>}
      <div className="grid grid-cols-[1fr_auto] gap-2 p-3">
        {available ? (
          <Link to={`/comic/${encodeURIComponent(comic.id)}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ef233c] px-3 py-2.5 text-sm font-extrabold text-white"><BookOpen className="h-4 w-4" /> Ver HQ</Link>
        ) : allowDownload ? (
          <button onClick={queue} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffd60a] px-3 py-2.5 text-sm font-black text-black disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{busy ? `${pct}%` : 'Baixar'}</button>
        ) : (
          <button disabled className="rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 text-sm font-bold text-[var(--muted)]">Somente catálogo</button>
        )}
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]"><HardDrive className="h-4 w-4" /></span>
      </div>
    </article>
  );
}
