import { BookOpen, CheckCircle2, FolderOpen } from 'lucide-react';
import { api } from '../services/api.js';

export default function SeriesCard({ series, onOpen }) {
  const cover = series.cover;
  const total = series.comics.length;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(series)}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 text-left shadow-xl shadow-black/10 transition duration-300 hover:-translate-y-1 hover:border-red-500/30 hover:bg-zinc-900"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-zinc-900">
        <div className="absolute inset-0 grid place-items-center text-zinc-700">
          <FolderOpen className="h-16 w-16" strokeWidth={1.15} />
        </div>
        {cover?.thumbnailUrl && (
          <img
            src={api.assetUrl(cover.thumbnailUrl)}
            alt={`Capa de ${series.name}`}
            loading="lazy"
            decoding="async"
            className="relative h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950 via-zinc-950/75 to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-200 backdrop-blur">
          {total} {total === 1 ? 'edição' : 'edições'}
        </span>
      </div>

      <div className="p-4">
        <h2 className="line-clamp-2 min-h-12 text-[15px] font-semibold leading-6 text-zinc-100" title={series.name}>{series.name}</h2>
        <p className="mt-1 truncate text-[11px] text-zinc-600" title={series.path}>{series.path}</p>
        {(series.inProgress > 0 || series.completed > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
            {series.inProgress > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-amber-200"><BookOpen className="h-3 w-3" /> {series.inProgress} em leitura</span>}
            {series.completed > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-300"><CheckCircle2 className="h-3 w-3" /> {series.completed} concluída{series.completed === 1 ? '' : 's'}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
