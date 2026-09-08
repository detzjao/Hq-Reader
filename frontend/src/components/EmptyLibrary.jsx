import { LibraryBig } from 'lucide-react';

export default function EmptyLibrary({ searching = false }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center">
      <div>
        <LibraryBig className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 font-semibold text-zinc-200">{searching ? 'Nenhuma HQ encontrada' : 'Biblioteca vazia'}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
          {searching ? 'Tente outro termo de pesquisa.' : 'Abra “Adicionar HQs” no cabeçalho e cole links públicos de arquivos do Google Drive.'}
        </p>
      </div>
    </div>
  );
}
