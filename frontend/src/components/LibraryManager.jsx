import {
  ChevronDown,
  ChevronUp,
  FileUp,
  LibraryBig,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';

const EXAMPLE_LINK = 'https://drive.google.com/file/d/ID_DO_ARQUIVO/view';
const CATEGORY_SUGGESTIONS = ['Marvel', 'DC Comics', 'Turma da Mônica'];
const ACCEPTED_FILES = '.pdf,.cbz,.cbr,.jpg,.jpeg,.png,.webp,.gif';

export default function LibraryManager() {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [collection, setCollection] = useState('');
  const [batchText, setBatchText] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const [uploadPath, setUploadPath] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [comics, setComics] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState('');
  const fileInputRef = useRef(null);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [library, comicsResponse] = await Promise.all([api.getLibraryStatus(), api.getComics()]);
      setStatus(library);
      setComics(comicsResponse.files || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const sortedComics = useMemo(
    () => [...comics].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })),
    [comics]
  );

  function notifyUpdate() {
    window.dispatchEvent(new CustomEvent('hq-reader:library-updated'));
  }

  async function handleSync() {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const result = await api.syncLibrarySources(true);
      const sources = result.sources || [];
      const synced = sources.filter((source) => source.ok);
      const failed = sources.filter((source) => !source.ok);
      if (synced.length) {
        const imported = synced.reduce((total, source) => total + Number(source.files || 0), 0);
        setMessage(`Bibliotecas atualizadas. ${imported} HQs encontradas em ${synced.length} ${synced.length === 1 ? 'fonte' : 'fontes'}.`);
      }
      if (failed.length) {
        setError(failed.map((source) => `${source.category}: ${source.error || 'não foi possível atualizar'}`).join(' • '));
      }
      if (!synced.length && !failed.length) setMessage('Nenhuma fonte configurada para atualizar.');
      notifyUpdate();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpload() {
    if (!uploadFiles.length) return;
    setUploading(true);
    setError('');
    setMessage('');
    let success = 0;
    const failures = [];
    for (let index = 0; index < uploadFiles.length; index += 1) {
      const file = uploadFiles[index];
      setUploadProgress(`${index + 1}/${uploadFiles.length} · ${file.name}`);
      try {
        await api.uploadToLibrary(file, uploadPath.trim());
        success += 1;
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    if (success) {
      setMessage(`${success} ${success === 1 ? 'HQ importada' : 'HQs importadas'} do computador.`);
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      notifyUpdate();
      await refresh();
    }
    if (failures.length) setError(failures.slice(0, 4).join(' • '));
    setUploadProgress('');
    setUploading(false);
  }

  async function handleAdd(event) {
    event.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await api.addToLibrary({ url: url.trim(), name: name.trim(), path: collection.trim() });
      setMessage(response.updated ? 'HQ atualizada na biblioteca.' : 'HQ adicionada à biblioteca.');
      setUrl('');
      setName('');
      notifyUpdate();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleBatchImport() {
    if (!batchText.trim()) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const response = await api.importLibrary(batchText);
      const changed = (response.added?.length || 0) + (response.updated?.length || 0);
      if (changed > 0) {
        setMessage(`${changed} ${changed === 1 ? 'HQ adicionada/atualizada' : 'HQs adicionadas/atualizadas'}.`);
        setBatchText('');
        notifyUpdate();
        await refresh();
      }
      if (response.failed?.length) setError(response.failed.slice(0, 4).map((item) => item.error).join(' • '));
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove(comic) {
    if (!window.confirm(`Remover “${comic.name}” da biblioteca?`)) return;
    setRemoving(comic.id);
    setError('');
    setMessage('');
    try {
      await api.removeFromLibrary(comic.id);
      setComics((current) => current.filter((item) => item.id !== comic.id));
      notifyUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving('');
    }
  }

  return (
    <div className="space-y-6">
      <datalist id="hq-category-suggestions">
        {CATEGORY_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
      </datalist>

      <section>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400">
              <RefreshCw className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-white">Bibliotecas conectadas</h3>
              <p className="mt-0.5 text-sm text-zinc-500">Marvel, DC Comics e Turma da Mônica.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        {status?.sources?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {status.sources.map((source) => (
              <span key={source.id} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-zinc-400">
                {source.category}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-white/5 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400">
            <UploadCloud className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-white">Importar arquivo</h3>
            <p className="mt-0.5 text-sm text-zinc-500">Envie PDF, CBZ, CBR ou imagens diretamente do seu computador.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr]">
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-300">Categoria / coleção</label>
            <input
              value={uploadPath}
              onChange={(event) => setUploadPath(event.target.value)}
              list="hq-category-suggestions"
              placeholder="Ex.: Marvel/Homem-Aranha"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-300">Arquivos</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
              className="block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-zinc-200 hover:file:bg-white/15"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || !uploadFiles.length || status?.uploadEnabled === false}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {uploading ? (uploadProgress || 'Importando...') : `Importar ${uploadFiles.length ? `(${uploadFiles.length})` : 'arquivo(s)'}`}
        </button>
      </section>

      <section className="border-t border-white/5 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400">
            <LibraryBig className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-white">Adicionar por link</h3>
            <p className="mt-0.5 text-sm text-zinc-500">Cole o link público de uma HQ armazenada no Drive.</p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="mt-5 space-y-4">
          <div>
            <label htmlFor="comic-url" className="mb-2 block text-xs font-semibold text-zinc-300">Link do arquivo</label>
            <input
              id="comic-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={EXAMPLE_LINK}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-300">Nome <span className="font-normal text-zinc-600">(opcional)</span></label>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Batman #001.pdf" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500/60" />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-300">Categoria / coleção</label>
              <input value={collection} onChange={(event) => setCollection(event.target.value)} list="hq-category-suggestions" placeholder="Ex.: DC Comics/Batman" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500/60" />
            </div>
          </div>
          <button type="submit" disabled={saving || !url.trim() || status?.writeEnabled === false} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Adicionando...' : 'Adicionar à biblioteca'}
          </button>
        </form>
      </section>

      <section className="border-t border-white/5 pt-5">
        <button type="button" onClick={() => setBatchOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 text-left" aria-expanded={batchOpen}>
          <div>
            <h3 className="text-sm font-bold text-white">Adicionar vários links</h3>
            <p className="mt-1 text-xs text-zinc-600">Uma HQ por linha.</p>
          </div>
          {batchOpen ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
        </button>
        {batchOpen && (
          <div className="mt-4">
            <p className="mb-2 text-xs leading-5 text-zinc-500">Formato: <span className="text-zinc-300">Categoria/Coleção/Nome.pdf | link</span></p>
            <textarea value={batchText} onChange={(event) => setBatchText(event.target.value)} rows={7} placeholder={'DC Comics/Batman/HQ 001.pdf | https://drive.google.com/file/d/ID/view\nMarvel/X-Men/HQ 001.cbz | https://drive.google.com/file/d/ID/view'} className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10" />
            <button type="button" onClick={handleBatchImport} disabled={importing || !batchText.trim() || status?.writeEnabled === false} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {importing ? 'Importando...' : 'Importar lista'}
            </button>
          </div>
        )}
      </section>

      {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-sm text-emerald-300">{message}</div>}
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-300">{error}</div>}

      <section className="border-t border-white/5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Catálogo atual</h3>
            <p className="mt-1 text-xs text-zinc-600">Gerencie as HQs disponíveis na biblioteca.</p>
          </div>
          <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-400">{comics.length}</span>
        </div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-5 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo...</div>
          ) : sortedComics.length ? sortedComics.map((comic) => (
            <div key={comic.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-200">{comic.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-zinc-600">{comic.path || 'Sem coleção'} · {comic.extension?.toUpperCase()}</p>
              </div>
              <button onClick={() => handleRemove(comic)} disabled={removing === comic.id || status?.writeEnabled === false} className="rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40" aria-label={`Remover ${comic.name} da biblioteca`}>
                {removing === comic.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          )) : <p className="py-5 text-xs text-zinc-600">Nenhuma HQ cadastrada.</p>}
        </div>
      </section>
    </div>
  );
}
