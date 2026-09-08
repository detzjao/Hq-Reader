import { ArrowLeft, BookOpen, Download, Expand, List, Minus, PanelLeft, Plus, Shrink } from 'lucide-react';

export default function ReaderToolbar({
  title,
  downloadUrl,
  zoom,
  onZoomIn,
  onZoomOut,
  isFullscreen,
  onFullscreen,
  mode,
  onModeChange,
  thumbnailsOpen,
  onToggleThumbnails,
  onBack
}) {
  return (
    <div className="flex min-h-14 items-center gap-2 border-b border-white/5 bg-zinc-950/95 px-2 py-2 backdrop-blur sm:px-4">
      <button onClick={onBack} className="flex shrink-0 items-center gap-2 rounded-lg p-2 text-zinc-300 hover:bg-white/5 hover:text-white sm:px-3" aria-label="Voltar para biblioteca">
        <ArrowLeft className="h-5 w-5" /> <span className="hidden text-sm sm:inline">Biblioteca</span>
      </button>

      <div className="min-w-0 flex-1 px-1 text-center">
        <div className="truncate text-xs font-semibold text-zinc-200 sm:text-sm">{title}</div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <a href={downloadUrl} download className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Baixar HQ" title="Baixar HQ">
          <Download className="h-5 w-5" />
        </a>
        <button onClick={onToggleThumbnails} className={`rounded-lg p-2 ${thumbnailsOpen ? 'bg-red-500/20 text-red-400' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`} aria-label="Abrir miniaturas">
          <PanelLeft className="h-5 w-5" />
        </button>
        <button onClick={() => onModeChange(mode === 'single' ? 'vertical' : 'single')} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label={mode === 'single' ? 'Ativar rolagem vertical' : 'Ativar página única'}>
          {mode === 'single' ? <List className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </button>
        <div className="hidden items-center rounded-lg border border-white/10 bg-zinc-900 sm:flex">
          <button onClick={onZoomOut} className="p-2 text-zinc-400 hover:text-white" aria-label="Diminuir zoom"><Minus className="h-4 w-4" /></button>
          <span className="w-14 text-center text-xs font-semibold text-zinc-300">{zoom}%</span>
          <button onClick={onZoomIn} className="p-2 text-zinc-400 hover:text-white" aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></button>
        </div>
        <button onClick={onFullscreen} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
          {isFullscreen ? <Shrink className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
