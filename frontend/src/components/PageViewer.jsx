import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { isIOSSafari, loadPdf } from '../services/pdf.js';

function useVisible(rootMargin = '700px') {
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
    }, { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, visible]);

  return [ref, visible];
}

function PdfCanvas({ documentUrl, pageNumber, zoom, fitMode = 'single' }) {
  const canvasRef = useRef(null);
  const renderRef = useRef(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        setLoading(true);
        setError(false);
        const pdf = await loadPdf(api.assetUrl(documentUrl));
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        let scale;
        if (fitMode === 'thumbnail') {
          scale = Math.min(0.28, 140 / baseViewport.width);
        } else if (fitMode === 'vertical') {
          const maxWidth = Math.min(1000, Math.max(280, window.innerWidth - 28));
          scale = (maxWidth / baseViewport.width) * (zoom / 100);
        } else {
          const maxWidth = Math.max(280, window.innerWidth - 24);
          const maxHeight = Math.max(320, window.innerHeight - 150);
          const fitScale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height);
          scale = fitScale * (zoom / 100);
        }
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, isIOSSafari() ? 1.5 : 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext('2d');
        renderRef.current?.cancel?.();
        renderRef.current = page.render({
          canvasContext: context,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
        });
        await renderRef.current.promise;
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }
    render();
    return () => {
      cancelled = true;
      renderRef.current?.cancel?.();
    };
  }, [documentUrl, fitMode, pageNumber, zoom]);

  if (error) return <div className="grid min-h-48 place-items-center text-sm text-red-400"><AlertTriangle className="mb-2 h-5 w-5" />Erro ao renderizar PDF.</div>;
  return (
    <div className="relative grid place-items-center">
      {loading && <LoaderCircle className="absolute h-6 w-6 animate-spin text-red-500" />}
      <canvas ref={canvasRef} className="max-w-none bg-white shadow-2xl shadow-black/40" aria-label={`Página ${pageNumber} do PDF`} />
    </div>
  );
}

function LazyPage({ page, comic, documentUrl, zoom, onVisible }) {
  const [ref, visible] = useVisible();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.45) onVisible?.(page.page);
    }, { threshold: [0.45, 0.7] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onVisible, page.page, ref]);

  return (
    <div ref={ref} data-page={page.page} className="flex min-h-[55vh] w-full items-center justify-center py-3 sm:py-5">
      {visible ? (
        comic.format === 'pdf' ? (
          <PdfCanvas documentUrl={documentUrl} pageNumber={page.page} zoom={zoom} fitMode="vertical" />
        ) : (
          <img src={api.assetUrl(page.url)} alt={`Página ${page.page} de ${comic.name}`} loading="lazy" className="h-auto max-w-none object-contain shadow-2xl shadow-black/40" style={{ width: `${Math.max(280, Math.min(1200, (window.innerWidth - 28) * (zoom / 100)))}px` }} />
        )
      ) : (
        <div className="grid h-[60vh] w-[min(85vw,700px)] place-items-center rounded bg-zinc-900 text-xs text-zinc-600">Página {page.page}</div>
      )}
    </div>
  );
}


function ImagePage({ src, alt, zoom }) {
  const [size, setSize] = useState(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  let style = { maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 150px)' };
  if (size) {
    const maxWidth = Math.max(280, viewport.width - 24);
    const maxHeight = Math.max(320, viewport.height - 150);
    const fit = Math.min(maxWidth / size.width, maxHeight / size.height);
    style = {
      width: `${Math.max(1, Math.round(size.width * fit * (zoom / 100)))}px`,
      height: 'auto',
      maxWidth: 'none',
      maxHeight: 'none'
    };
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable="false"
      onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      className="object-contain shadow-2xl shadow-black/40"
      style={style}
    />
  );
}
export default function PageViewer({ comic, pages, documentUrl, currentPage, zoom, mode, onNext, onPrevious, onCurrentPageChange }) {
  const touch = useRef({ startX: 0, startY: 0, startDistance: 0, startZoom: zoom });
  const containerRef = useRef(null);

  useEffect(() => {
    if (mode !== 'single' || !pages[currentPage]) return;
    const next = pages[currentPage];
    if (next && comic.format !== 'pdf') {
      const image = new Image();
      image.src = api.assetUrl(next.url);
    } else if (next && comic.format === 'pdf') {
      loadPdf(api.assetUrl(documentUrl)).then((pdf) => pdf.getPage(next.page)).catch(() => {});
    }
  }, [comic.format, currentPage, documentUrl, mode, pages]);

  function touchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function handleTouchStart(event) {
    const first = event.touches[0];
    touch.current = {
      startX: first?.clientX || 0,
      startY: first?.clientY || 0,
      startDistance: touchDistance(event.touches),
      startZoom: zoom
    };
  }

  function handleTouchMove(event) {
    if (event.touches.length === 2 && touch.current.startDistance) {
      event.preventDefault();
      const distance = touchDistance(event.touches);
      const scale = distance / touch.current.startDistance;
      const nextZoom = Math.max(50, Math.min(300, Math.round((touch.current.startZoom * scale) / 10) * 10));
      onCurrentPageChange(currentPage, nextZoom);
    }
  }

  function handleTouchEnd(event) {
    if (mode !== 'single' || event.changedTouches.length !== 1 || touch.current.startDistance) {
      touch.current.startDistance = 0;
      return;
    }
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.current.startX;
    const dy = point.clientY - touch.current.startY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx < 0) onNext(); else onPrevious();
    }
  }

  function handleClick(event) {
    if (mode !== 'single') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < rect.width * 0.3) onPrevious();
    if (x > rect.width * 0.7) onNext();
  }

  if (mode === 'vertical') {
    return (
      <div ref={containerRef} className="reader-scrollbar h-full overflow-auto bg-zinc-950 px-2" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="mx-auto flex min-w-max flex-col items-center">
          {pages.map((page) => <LazyPage key={page.page} page={page} comic={comic} documentUrl={documentUrl} zoom={zoom} onVisible={(pageNumber) => onCurrentPageChange(pageNumber)} />)}
        </div>
      </div>
    );
  }

  const page = pages[currentPage - 1];
  if (!page) return null;

  return (
    <div
      className="no-select relative flex h-full w-full cursor-default items-center justify-center overflow-auto bg-zinc-950 p-2 sm:p-4"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
      aria-label="Área de leitura. Clique à esquerda para voltar e à direita para avançar."
    >
      <div className="min-w-max">
        {comic.format === 'pdf' ? (
          <PdfCanvas documentUrl={documentUrl} pageNumber={currentPage} zoom={zoom} fitMode="single" />
        ) : (
          <ImagePage src={api.assetUrl(page.url)} alt={`Página ${currentPage} de ${comic.name}`} zoom={zoom} />
        )}
      </div>
    </div>
  );
}

export { PdfCanvas };
