import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { PdfCanvas } from './PageViewer.jsx';

function LazyThumbnail({ comic, page, documentUrl }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="flex min-h-24 items-center justify-center overflow-hidden rounded bg-black/40">
      {!visible ? (
        <div className="h-24 w-full animate-pulse bg-zinc-900" />
      ) : comic.format === 'pdf' ? (
        <PdfCanvas documentUrl={documentUrl} pageNumber={page.page} zoom={100} fitMode="thumbnail" />
      ) : (
        <img src={api.assetUrl(page.url)} alt={`Miniatura da página ${page.page}`} loading="lazy" className="max-h-28 w-auto object-contain" />
      )}
    </div>
  );
}

export default function ThumbnailSidebar({ open, onClose, comic, pages, documentUrl, currentPage, onSelect }) {
  if (!open) return null;

  return (
    <aside className="absolute inset-y-0 left-0 z-30 w-40 border-r border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur sm:w-48" aria-label="Miniaturas das páginas">
      <div className="flex h-14 items-center justify-between border-b border-white/5 px-3">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Páginas</span>
        <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Fechar miniaturas"><X className="h-4 w-4" /></button>
      </div>
      <div className="h-[calc(100%-3.5rem)] overflow-y-auto p-2">
        {pages.map((page) => (
          <button key={page.page} onClick={() => onSelect(page.page)} className={`mb-2 w-full overflow-hidden rounded-xl border p-2 text-left transition ${currentPage === page.page ? 'border-red-500/60 bg-red-500/10' : 'border-white/5 bg-zinc-900 hover:border-white/20'}`}>
            <div className="mb-1.5 text-[10px] font-bold text-zinc-500">{String(page.page).padStart(2, '0')}</div>
            <LazyThumbnail comic={comic} page={page} documentUrl={documentUrl} />
          </button>
        ))}
      </div>
    </aside>
  );
}
