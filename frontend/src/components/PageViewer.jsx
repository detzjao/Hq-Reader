import { AlertTriangle, LoaderCircle } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { api } from '../services/api.js';
import { isIOSSafari, loadPdf } from '../services/pdf.js';

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
const clamp01 = (value) => Math.min(1, Math.max(0, value));

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

const PageViewer = forwardRef(function PageViewer({ comic, pages, documentUrl, currentPage, zoom, mode, onNext, onPrevious, onCurrentPageChange }, ref) {
  const containerRef = useRef(null);
  const pageRef = useRef(null);
  const zoomRef = useRef(zoom);
  const pendingAnchorRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const lastTapRef = useRef({ at: 0, x: 0, y: 0 });
  const mouseDragRef = useRef(null);
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    startDistance: 0,
    startZoom: zoom,
    moved: false,
    wasPinching: false,
    pinchAnchor: null
  });

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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

  const pageAnchorAt = useCallback((clientX, clientY) => {
    const page = pageRef.current;
    if (!page) return null;
    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
      width: rect.width,
      height: rect.height
    };
  }, []);

  const applyAnchor = useCallback(() => {
    const pending = pendingAnchorRef.current;
    const container = containerRef.current;
    const page = pageRef.current;
    if (!pending || !container || !page || mode !== 'single') return false;

    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const sizeChanged = Math.abs(rect.width - pending.width) > 1 || Math.abs(rect.height - pending.height) > 1;
    if (pending.targetZoom !== pending.startZoom && !sizeChanged) return false;

    const newClientX = rect.left + pending.x * rect.width;
    const newClientY = rect.top + pending.y * rect.height;
    container.scrollLeft += newClientX - pending.clientX;
    container.scrollTop += newClientY - pending.clientY;
    pendingAnchorRef.current = null;
    return true;
  }, [mode]);

  useEffect(() => {
    if (mode !== 'single' || !pageRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (pendingAnchorRef.current) requestAnimationFrame(() => applyAnchor());
    });
    observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, [applyAnchor, currentPage, mode]);

  useEffect(() => {
    if (!pendingAnchorRef.current || mode !== 'single') return undefined;
    const first = requestAnimationFrame(() => {
      requestAnimationFrame(() => applyAnchor());
    });
    const timeout = window.setTimeout(() => applyAnchor(), 180);
    return () => {
      cancelAnimationFrame(first);
      window.clearTimeout(timeout);
    };
  }, [applyAnchor, zoom, mode]);

  const requestZoomAt = useCallback((clientX, clientY, value) => {
    const nextZoom = clampZoom(value);
    const previousZoom = zoomRef.current;
    if (nextZoom === previousZoom) return;

    if (mode === 'single') {
      const anchor = pageAnchorAt(clientX, clientY);
      if (anchor) {
        pendingAnchorRef.current = {
          ...anchor,
          clientX,
          clientY,
          startZoom: previousZoom,
          targetZoom: nextZoom
        };
      }
    }

    zoomRef.current = nextZoom;
    onCurrentPageChange(currentPage, nextZoom);
  }, [currentPage, mode, onCurrentPageChange, pageAnchorAt]);

  const zoomAtViewportCenter = useCallback((value) => {
    const container = containerRef.current;
    if (!container) {
      zoomRef.current = clampZoom(value);
      onCurrentPageChange(currentPage, zoomRef.current);
      return;
    }
    const rect = container.getBoundingClientRect();
    requestZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, value);
  }, [currentPage, onCurrentPageChange, requestZoomAt]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAtViewportCenter(zoomRef.current + 10),
    zoomOut: () => zoomAtViewportCenter(zoomRef.current - 10),
    resetZoom: () => zoomAtViewportCenter(100)
  }), [zoomAtViewportCenter]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mode !== 'single') return undefined;

    function onWheel(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 10 : -10;
      requestZoomAt(event.clientX, event.clientY, zoomRef.current + direction);
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [mode, requestZoomAt]);

  useEffect(() => {
    pendingAnchorRef.current = null;
    if (mode !== 'single') return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
        container.scrollTop = zoomRef.current > 100 ? 0 : Math.max(0, (container.scrollHeight - container.clientHeight) / 2);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [currentPage, mode]);

  function touchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function touchCenter(touches) {
    if (touches.length < 2) return { x: touches[0]?.clientX || 0, y: touches[0]?.clientY || 0 };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function handleTouchStart(event) {
    const container = containerRef.current;
    if (!container) return;

    if (event.touches.length >= 2 && mode === 'single') {
      const center = touchCenter(event.touches);
      touchRef.current = {
        ...touchRef.current,
        startDistance: touchDistance(event.touches),
        startZoom: zoomRef.current,
        moved: false,
        wasPinching: true,
        pinchAnchor: pageAnchorAt(center.x, center.y)
      };
      return;
    }

    const first = event.touches[0];
    touchRef.current = {
      startX: first?.clientX || 0,
      startY: first?.clientY || 0,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
      startDistance: 0,
      startZoom: zoomRef.current,
      moved: false,
      wasPinching: false,
      pinchAnchor: null
    };
  }

  function handleTouchMove(event) {
    const container = containerRef.current;
    if (!container) return;

    if (mode === 'single' && event.touches.length >= 2) {
      event.preventDefault();
      const state = touchRef.current;
      if (!state.startDistance) {
        const center = touchCenter(event.touches);
        state.startDistance = touchDistance(event.touches);
        state.startZoom = zoomRef.current;
        state.wasPinching = true;
        state.pinchAnchor = pageAnchorAt(center.x, center.y);
      }

      const distance = touchDistance(event.touches);
      const center = touchCenter(event.touches);
      const scale = state.startDistance ? distance / state.startDistance : 1;
      const nextZoom = clampZoom(Math.round((state.startZoom * scale) / 10) * 10);
      const anchor = state.pinchAnchor;

      if (anchor) {
        const rect = pageRef.current?.getBoundingClientRect();
        if (rect) {
          pendingAnchorRef.current = {
            ...anchor,
            width: rect.width,
            height: rect.height,
            clientX: center.x,
            clientY: center.y,
            startZoom: zoomRef.current,
            targetZoom: nextZoom
          };
        }
      }

      if (nextZoom !== zoomRef.current) {
        zoomRef.current = nextZoom;
        onCurrentPageChange(currentPage, nextZoom);
      } else if (anchor && pageRef.current) {
        const rect = pageRef.current.getBoundingClientRect();
        const x = rect.left + anchor.x * rect.width;
        const y = rect.top + anchor.y * rect.height;
        container.scrollLeft += x - center.x;
        container.scrollTop += y - center.y;
      }
      state.moved = true;
      return;
    }

    if (mode === 'single' && zoomRef.current > 100 && event.touches.length === 1) {
      event.preventDefault();
      const point = event.touches[0];
      const state = touchRef.current;
      const dx = point.clientX - state.startX;
      const dy = point.clientY - state.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.moved = true;
      container.scrollLeft = state.startScrollLeft - dx;
      container.scrollTop = state.startScrollTop - dy;
    }
  }

  function handleTouchEnd(event) {
    const state = touchRef.current;

    if (state.wasPinching) {
      if (event.touches.length === 0) {
        state.wasPinching = false;
        state.startDistance = 0;
        state.pinchAnchor = null;
        suppressClickUntilRef.current = Date.now() + 350;
      }
      return;
    }

    if (mode !== 'single' || event.changedTouches.length !== 1) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - state.startX;
    const dy = point.clientY - state.startY;

    if (zoomRef.current > 100) {
      if (state.moved) suppressClickUntilRef.current = Date.now() + 250;
      return;
    }

    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      suppressClickUntilRef.current = Date.now() + 250;
      if (dx < 0) onNext(); else onPrevious();
      return;
    }

    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
      const now = Date.now();
      const last = lastTapRef.current;
      const close = Math.hypot(point.clientX - last.x, point.clientY - last.y) < 38;
      if (now - last.at < 320 && close) {
        suppressClickUntilRef.current = now + 400;
        requestZoomAt(point.clientX, point.clientY, zoomRef.current <= 110 ? 200 : 100);
        lastTapRef.current = { at: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { at: now, x: point.clientX, y: point.clientY };
      }
    }
  }

  function handlePointerDown(event) {
    if (mode !== 'single' || zoomRef.current <= 100 || event.pointerType === 'touch' || event.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    mouseDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      moved: false
    };
  }

  function handlePointerMove(event) {
    const drag = mouseDragRef.current;
    const container = containerRef.current;
    if (!drag || !container || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
    container.scrollLeft = drag.scrollLeft - dx;
    container.scrollTop = drag.scrollTop - dy;
  }

  function handlePointerUp(event) {
    const drag = mouseDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) suppressClickUntilRef.current = Date.now() + 250;
    mouseDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleClick(event) {
    if (mode !== 'single' || Date.now() < suppressClickUntilRef.current || zoomRef.current > 100) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < rect.width * 0.28) onPrevious();
    else if (x > rect.width * 0.72) onNext();
  }

  function handleDoubleClick(event) {
    if (mode !== 'single') return;
    event.preventDefault();
    suppressClickUntilRef.current = Date.now() + 250;
    requestZoomAt(event.clientX, event.clientY, zoomRef.current <= 110 ? 200 : 100);
  }

  if (mode === 'vertical') {
    return (
      <div ref={containerRef} className="reader-scrollbar h-full overflow-auto overscroll-contain bg-zinc-950 px-2">
        <div className="mx-auto flex w-max min-w-full flex-col items-center">
          {pages.map((page) => <LazyPage key={page.page} page={page} comic={comic} documentUrl={documentUrl} zoom={zoom} onVisible={(pageNumber) => onCurrentPageChange(pageNumber)} />)}
        </div>
      </div>
    );
  }

  const page = pages[currentPage - 1];
  if (!page) return null;

  return (
    <div
      ref={containerRef}
      className={`no-select reader-scrollbar relative h-full w-full overflow-auto overscroll-contain bg-zinc-950 ${zoom > 100 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none', WebkitOverflowScrolling: 'touch' }}
      aria-label="Área de leitura. Arraste para mover quando estiver ampliado, faça pinça para zoom e toque nas bordas para trocar de página."
    >
      <div className="flex h-max min-h-full w-max min-w-full items-center justify-center p-2 sm:p-4">
        <div ref={pageRef} className="shrink-0">
          {comic.format === 'pdf' ? (
            <PdfCanvas documentUrl={documentUrl} pageNumber={currentPage} zoom={zoom} fitMode="single" />
          ) : (
            <ImagePage src={api.assetUrl(page.url)} alt={`Página ${currentPage} de ${comic.name}`} zoom={zoom} />
          )}
        </div>
      </div>
    </div>
  );
});

export default PageViewer;
export { PdfCanvas };
