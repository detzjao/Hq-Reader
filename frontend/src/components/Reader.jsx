import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { getReadingState, markReadingStarted, saveReadingState } from '../services/libraryState.js';
import PageControls from './PageControls.jsx';
import PageViewer from './PageViewer.jsx';
import ProgressBar from './ProgressBar.jsx';
import ReaderToolbar from './ReaderToolbar.jsx';
import ThumbnailSidebar from './ThumbnailSidebar.jsx';

const clampZoom = (value) => Math.min(500, Math.max(50, value));

export default function Reader({ comic, pages, documentUrl }) {
  const navigate = useNavigate();
  const shellRef = useRef(null);
  const viewerRef = useRef(null);
  const skipInitialProgressWriteRef = useRef(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState(() => localStorage.getItem('hq-reader:mode') || 'single');
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [resumePage, setResumePage] = useState(null);

  const progressKey = `hq-reader:progress:${comic.id}`;

  useEffect(() => {
    const reading = getReadingState(comic.id);
    const saved = Number(reading?.lastPage || localStorage.getItem(progressKey));
    if (Number.isInteger(saved) && saved > 1 && saved <= pages.length) setResumePage(saved);
    markReadingStarted(comic.id, pages.length);
  }, [comic.id, pages.length, progressKey]);

  useEffect(() => {
    if (skipInitialProgressWriteRef.current) {
      skipInitialProgressWriteRef.current = false;
      return;
    }
    saveReadingState(comic.id, {
      lastPage: currentPage,
      totalPages: pages.length,
      completed: pages.length > 0 && currentPage >= pages.length
    });
  }, [comic.id, currentPage, pages.length]);

  useEffect(() => {
    localStorage.setItem('hq-reader:mode', mode);
  }, [mode]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const previous = useCallback(() => setCurrentPage((page) => Math.max(1, page - 1)), []);
  const next = useCallback(() => setCurrentPage((page) => Math.min(pages.length, page + 1)), [pages.length]);
  const zoomIn = useCallback(() => {
    if (viewerRef.current?.zoomIn) viewerRef.current.zoomIn();
    else setZoom((value) => clampZoom(value + 10));
  }, []);
  const zoomOut = useCallback(() => {
    if (viewerRef.current?.zoomOut) viewerRef.current.zoomOut();
    else setZoom((value) => clampZoom(value - 10));
  }, []);
  const resetZoom = useCallback(() => {
    if (viewerRef.current?.resetZoom) viewerRef.current.resetZoom();
    else setZoom(100);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      // Fullscreen pode ser bloqueado pelo navegador; nenhuma quebra de leitura.
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
      else if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next(); }
      else if (event.key === 'Escape') {
        if (!document.fullscreenElement) navigate('/');
      } else if (event.key === '+' || event.key === '=') zoomIn();
      else if (event.key === '-') zoomOut();
      else if (event.key === '0') resetZoom();
      else if (event.key.toLowerCase() === 'f') toggleFullscreen();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, next, previous, resetZoom, toggleFullscreen, zoomIn, zoomOut]);

  function handleCurrentPageChange(page, pinchZoom) {
    if (Number.isInteger(page)) setCurrentPage(Math.min(pages.length, Math.max(1, page)));
    if (pinchZoom) setZoom(clampZoom(pinchZoom));
  }

  return (
    <div ref={shellRef} className="relative flex h-screen min-h-[480px] flex-col overflow-hidden bg-zinc-950 text-white" style={{ height: '100dvh' }}>
      <ReaderToolbar
        title={comic.name.replace(/\.[^.]+$/, '')}
        downloadUrl={api.downloadUrl(comic.id)}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={resetZoom}
        isFullscreen={isFullscreen}
        onFullscreen={toggleFullscreen}
        mode={mode}
        onModeChange={setMode}
        thumbnailsOpen={thumbnailsOpen}
        onToggleThumbnails={() => setThumbnailsOpen((value) => !value)}
        onBack={() => navigate('/')}
      />
      <ProgressBar current={currentPage} total={pages.length} />

      <div className="relative min-h-0 flex-1">
        <ThumbnailSidebar open={thumbnailsOpen} onClose={() => setThumbnailsOpen(false)} comic={comic} pages={pages} documentUrl={documentUrl} currentPage={currentPage} onSelect={(page) => { setCurrentPage(page); setMode('single'); setThumbnailsOpen(false); }} />
        <PageViewer ref={viewerRef} comic={comic} pages={pages} documentUrl={documentUrl} currentPage={currentPage} zoom={zoom} mode={mode} onNext={next} onPrevious={previous} onCurrentPageChange={handleCurrentPageChange} />
      </div>

      <PageControls current={currentPage} total={pages.length} onPrevious={previous} onNext={next} zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={resetZoom} mode={mode} />

      {resumePage && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-500">Progresso salvo</p>
            <h2 className="mt-2 text-xl font-bold text-white">Continuar de onde parou?</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Sua última página foi a {resumePage} de {pages.length}.</p>
            <div className="mt-6 grid gap-2">
              <button onClick={() => { setCurrentPage(resumePage); setResumePage(null); }} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500">Continuar leitura</button>
              <button onClick={() => { saveReadingState(comic.id, { lastPage: 1, totalPages: pages.length, completed: pages.length === 1 }); setCurrentPage(1); setResumePage(null); }} className="rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-white/10">Começar do início</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
