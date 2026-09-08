import { useEffect, useMemo, useRef, useState } from 'react';
import ComicCard from './ComicCard.jsx';

const PAGE_SIZE = 36;

export default function ComicGrid({ comics, favoriteIds = new Set(), readingStates = {}, onToggleFavorite }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const signature = useMemo(() => `${comics.length}:${comics[0]?.id || ''}:${comics.at(-1)?.id || ''}`, [comics]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [signature]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleCount >= comics.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((count) => Math.min(comics.length, count + PAGE_SIZE));
    }, { rootMargin: '900px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [comics.length, visibleCount]);

  const visible = comics.slice(0, visibleCount);
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((comic) => (
          <ComicCard
            key={comic.id}
            comic={comic}
            favorite={favoriteIds.has(String(comic.id))}
            readingState={readingStates[String(comic.id)] || null}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
      {visibleCount < comics.length && <div ref={sentinelRef} className="mt-6 h-8 text-center text-xs text-zinc-700">Carregando mais HQs...</div>}
    </>
  );
}
