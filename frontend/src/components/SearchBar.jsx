import { Search, X } from 'lucide-react';
import { forwardRef } from 'react';

const SearchBar = forwardRef(function SearchBar({ value, onChange }, ref) {
  return (
    <div className="relative max-w-xl">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Pesquisar HQ..."
        aria-label="Pesquisar HQ"
        className="h-12 w-full rounded-2xl border border-white/10 bg-zinc-900/80 pl-12 pr-11 text-sm text-white shadow-sm transition placeholder:text-zinc-500 hover:border-white/20 focus:border-red-500/60 focus:bg-zinc-900 focus:outline-none focus:ring-4 focus:ring-red-500/10"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200" aria-label="Limpar pesquisa">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

export default SearchBar;
