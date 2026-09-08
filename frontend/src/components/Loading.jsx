import { LoaderCircle } from 'lucide-react';

export default function Loading({ label = 'Carregando biblioteca...' }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-4 text-zinc-400" role="status" aria-live="polite">
      <LoaderCircle className="h-7 w-7 animate-spin text-red-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
