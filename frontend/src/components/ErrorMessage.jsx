import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorMessage({ error, onRetry }) {
  const publicFileProblem = [
    'DRIVE_PUBLIC_DOWNLOAD_FAILED',
    'DRIVE_DOWNLOAD_RESTRICTED',
    'DRIVE_NOT_FOUND',
    'DRIVE_PUBLIC_UNAVAILABLE'
  ].includes(error?.code);

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-6 sm:p-8" role="alert">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-400">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-red-200">Não foi possível concluir a operação</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {error?.message || 'Ocorreu um erro inesperado.'}
          </p>

          {publicFileProblem && (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
              O HQ Reader não usa credenciais. Por isso, o arquivo precisa continuar compartilhado publicamente e com download permitido pelo proprietário.
            </p>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
