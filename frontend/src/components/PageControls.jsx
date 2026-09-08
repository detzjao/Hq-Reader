import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

export default function PageControls({ current, total, onPrevious, onNext, zoom, onZoomIn, onZoomOut, onZoomReset, mode }) {
  return (
    <div className="border-t border-white/5 bg-zinc-950/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <button onClick={onPrevious} disabled={current <= 1 || mode !== 'single'} className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-zinc-900 px-3 text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Página anterior">
          <ChevronLeft className="h-5 w-5" /> <span className="hidden text-sm font-medium sm:inline">Anterior</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-white/10 bg-zinc-900 sm:hidden">
            <button onClick={onZoomOut} className="p-2.5 text-zinc-400" aria-label="Diminuir zoom"><Minus className="h-4 w-4" /></button>
            <button onClick={onZoomReset} className="w-12 text-center text-[11px] font-bold text-zinc-300" aria-label="Restaurar zoom para 100%" title="Restaurar zoom">{zoom}%</button>
            <button onClick={onZoomIn} className="p-2.5 text-zinc-400" aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="min-w-16 text-center text-xs font-semibold tabular-nums text-zinc-300 sm:text-sm">{current} / {total}</div>
        </div>

        <button onClick={onNext} disabled={current >= total || mode !== 'single'} className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-red-600 px-3 text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600" aria-label="Próxima página">
          <span className="hidden text-sm font-medium sm:inline">Próxima</span> <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
