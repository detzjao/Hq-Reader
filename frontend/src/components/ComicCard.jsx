import { BookOpen, Download, FileImage, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

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

export default function ComicCard({ comic }) {
  const isPdf = comic.format === 'pdf';
  const Icon = isPdf ? FileText : FileImage;
  const readerUrl = `/reader/${encodeURIComponent(comic.id)}`;

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 shadow-xl shadow-black/10 transition duration-300 hover:-translate-y-1 hover:border-red-500/30 hover:bg-zinc-900 hover:shadow-glow">
      <Link to={readerUrl} className="block" aria-label={`Ler ${comic.name}`}>
        <div className="relative aspect-[2/3] overflow-hidden bg-zinc-900">
          <div className="absolute inset-0 grid place-items-center text-zinc-700">
            <Icon className="h-14 w-14" strokeWidth={1.2} />
          </div>
          <img
            src={api.assetUrl(comic.thumbnailUrl)}
            alt={`Capa de ${comic.name}`}
            loading="lazy"
            className="relative h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent" />
          <span className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-200 backdrop-blur">
            {comic.extension}
          </span>
        </div>

        <div className="px-4 pt-4">
          <h2 className="line-clamp-2 min-h-12 text-[15px] font-semibold leading-6 text-zinc-100" title={comic.name}>
            {comic.name.replace(/\.[^.]+$/, '')}
          </h2>
          {comic.path && <div className="mt-1 truncate text-[11px] text-zinc-600" title={comic.path}>{comic.path}</div>}
          <div className="mt-1 text-xs text-zinc-500">{formatSize(comic.size)}</div>
        </div>
      </Link>

      <div className="grid grid-cols-[1fr_auto] gap-2 p-4 pt-3">
        <Link to={readerUrl} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-red-500">
          <BookOpen className="h-4 w-4" /> Ler
        </Link>
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
