import {
  ChevronDown,
  ChevronUp,
  Database,
  FileUp,
  KeyRound,
  LibraryBig,
  Loader2,
  Plus,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getAdminToken, setAdminToken, uploadBlobFile, uploadThumbnailBlob } from '../services/api.js';
import { loadPdf } from '../services/pdf.js';

const EXAMPLE_LINK = 'https://drive.google.com/file/d/ID_DO_ARQUIVO/view';
const CATEGORY_SUGGESTIONS = ['Marvel', 'DC Comics', 'Turma da Mônica'];
const ACCEPTED_FILES = '.pdf,.cbz,.cbr,.jpg,.jpeg,.png,.webp,.gif';

function ext(name = '') { return name.split('.').pop()?.toLowerCase() || ''; }

async function pdfCover(file) {
  if (ext(file.name) !== 'pdf') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const pdf = await loadPdf(objectUrl);
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, 420 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } catch { return null; }
  finally { URL.revokeObjectURL(objectUrl); }
}

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
  const [uploadProgress, setUploadProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState('');
  const [adminToken, setAdminTokenState] = useState(() => getAdminToken());
  const fileInputRef = useRef(null);

  async function refresh(fresh = false) {
    setLoading(true);
    setError('');
    try {
      const [library, comicsResponse] = await Promise.all([api.getLibraryStatus(), api.getComics(fresh)]);
      setStatus(library);
      setComics(comicsResponse.files || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  const sortedComics = useMemo(
    () => [...comics].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })),
    [comics]
  );

  function notifyUpdate() { window.dispatchEvent(new CustomEvent('hq-reader:library-updated')); }
  function canWrite() { return Boolean(status?.writeEnabled && getAdminToken()); }

  function savePassword() {
    setAdminToken(adminToken);
    setMessage(adminToken.trim() ? 'Senha salva neste navegador.' : 'Senha removida deste navegador.');
    setError('');
  }

  async function handleUpload() {
    if (!uploadFiles.length || !canWrite()) return;
    setUploading(true); setError(''); setMessage('');
    let success = 0;
    const failures = [];
    for (let index = 0; index < uploadFiles.length; index += 1) {
      const file = uploadFiles[index];
      try {
        setUploadProgress(`${index + 1}/${uploadFiles.length} · ${file.name}`);
        const blob = await uploadBlobFile(file, {
          onProgress: ({ percentage }) => setUploadProgress(`${index + 1}/${uploadFiles.length} · ${file.name} · ${Math.round(percentage || 0)}%`)
        });
        let thumbnailUrl = '';
        const cover = await pdfCover(file);
        if (cover) {
          const coverBlob = await uploadThumbnailBlob(cover, `${file.name.replace(/\.[^.]+$/, '')}-cover.jpg`);
          thumbnailUrl = coverBlob?.url || '';
        }
        await api.registerUpload({ blob, originalName: file.name, size: file.size, path: uploadPath.trim(), thumbnailUrl });
        success += 1;
      } catch (err) { failures.push(`${file.name}: ${err.message}`); }
    }
    if (success) {
      setMessage(`${success} ${success === 1 ? 'HQ importada' : 'HQs importadas'} com sucesso.`);
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      notifyUpdate();
      await refresh(true);
    }
    if (failures.length) setError(failures.slice(0, 4).join(' • '));
    setUploadProgress(''); setUploading(false);
  }

  async function handleAdd(event) {
    event.preventDefault();
    if (!url.trim() || !canWrite()) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.addToLibrary({ url: url.trim(), name: name.trim(), path: collection.trim() });
      setMessage('HQ adicionada à biblioteca.');
      setUrl(''); setName('');
      notifyUpdate(); await refresh(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleBatchImport() {
    if (!batchText.trim() || !canWrite()) return;
    setImporting(true); setError(''); setMessage('');
    try {
      const response = await api.importLibrary(batchText);
      const changed = response.added?.length || 0;
      if (changed) {
        setMessage(`${changed} ${changed === 1 ? 'HQ adicionada' : 'HQs adicionadas'}.`);
        setBatchText(''); notifyUpdate(); await refresh(true);
      }
      if (response.failed?.length) setError(response.failed.slice(0, 4).map((item) => item.error).join(' • '));
    } catch (err) { setError(err.message); }
    finally { setImporting(false); }
  }

  async function handleRemove(comic) {
    if (!canWrite() || !window.confirm(`Remover “${comic.name}” da biblioteca?`)) return;
    setRemoving(comic.id); setError(''); setMessage('');
    try {
      await api.removeFromLibrary(comic.id);
      setComics((current) => current.filter((item) => item.id !== comic.id));
      notifyUpdate();
    } catch (err) { setError(err.message); }
    finally { setRemoving(''); }
  }

  return (
    <div className="space-y-6">
      <datalist id="hq-category-suggestions">{CATEGORY_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>

      <section>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400"><Database className="h-5 w-5" /></span>
          <div>
            <h3 className="text-lg font-bold text-white">Armazenamento</h3>
            <p className="mt-0.5 text-sm text-zinc-500">Biblioteca e arquivos persistentes no Vercel.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-3"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Catálogo</p><p className="mt-1 text-sm font-bold text-white">{status?.total ?? '—'} HQs</p></div>
          <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-3"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Vercel Blob</p><p className={`mt-1 text-sm font-bold ${status?.blobConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>{status?.blobConfigured ? 'Conectado' : 'Não conectado'}</p></div>
          <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-3"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Edição</p><p className={`mt-1 text-sm font-bold ${status?.writeEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>{status?.writeEnabled ? 'Habilitada' : 'Bloqueada'}</p></div>
        </div>
        {!status?.blobConfigured && <p className="mt-3 text-xs leading-5 text-amber-300/80">Para importar arquivos e salvar alterações, conecte um Blob Store em Storage no projeto Vercel.</p>}
      </section>

      <section className="border-t border-white/5 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400"><KeyRound className="h-5 w-5" /></span>
          <div><h3 className="text-lg font-bold text-white">Administração</h3><p className="mt-0.5 text-sm text-zinc-500">A senha protege uploads e alterações na biblioteca.</p></div>
        </div>
        <div className="mt-4 flex gap-2">
          <input type="password" value={adminToken} onChange={(e) => setAdminTokenState(e.target.value)} placeholder="Senha de administração" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500/60" />
          <button type="button" onClick={savePassword} className="rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-200 hover:bg-white/10">Salvar</button>
        </div>
      </section>

      <section className="border-t border-white/5 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400"><UploadCloud className="h-5 w-5" /></span>
          <div><h3 className="text-lg font-bold text-white">Importar arquivo</h3><p className="mt-0.5 text-sm text-zinc-500">PDF, CBZ, CBR ou imagens do seu computador.</p></div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><label className="mb-2 block text-xs font-semibold text-zinc-300">Categoria / coleção</label><input value={uploadPath} onChange={(e) => setUploadPath(e.target.value)} list="hq-category-suggestions" placeholder="Ex.: DC Comics/Batman" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500/60" /></div>
          <div><label className="mb-2 block text-xs font-semibold text-zinc-300">Arquivos</label><input ref={fileInputRef} type="file" multiple accept={ACCEPTED_FILES} onChange={(e) => setUploadFiles(Array.from(e.target.files || []))} className="block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-zinc-200" /></div>
        </div>
        <button type="button" onClick={handleUpload} disabled={uploading || !uploadFiles.length || !canWrite()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{uploading ? (uploadProgress || 'Importando...') : `Importar ${uploadFiles.length ? `(${uploadFiles.length})` : 'arquivo(s)'}`}</button>
      </section>

      <section className="border-t border-white/5 pt-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400"><LibraryBig className="h-5 w-5" /></span><div><h3 className="text-lg font-bold text-white">Adicionar por link</h3><p className="mt-0.5 text-sm text-zinc-500">Adicione um arquivo público do Google Drive.</p></div></div>
        <form onSubmit={handleAdd} className="mt-5 space-y-4">
          <div><label className="mb-2 block text-xs font-semibold text-zinc-300">Link do arquivo</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={EXAMPLE_LINK} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500/60" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-xs font-semibold text-zinc-300">Nome <span className="font-normal text-zinc-600">(opcional)</span></label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Batman #001.pdf" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500/60" /></div><div><label className="mb-2 block text-xs font-semibold text-zinc-300">Categoria / coleção</label><input value={collection} onChange={(e) => setCollection(e.target.value)} list="hq-category-suggestions" placeholder="DC Comics/Batman" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-red-500/60" /></div></div>
          <button type="submit" disabled={saving || !url.trim() || !canWrite()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Adicionando...' : 'Adicionar à biblioteca'}</button>
        </form>
      </section>

      <section className="border-t border-white/5 pt-5">
        <button type="button" onClick={() => setBatchOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 text-left"><div><h3 className="text-sm font-bold text-white">Adicionar vários links</h3><p className="mt-1 text-xs text-zinc-600">Uma HQ por linha.</p></div>{batchOpen ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}</button>
        {batchOpen && <div className="mt-4"><p className="mb-2 text-xs text-zinc-500">Formato: <span className="text-zinc-300">Categoria/Coleção/Nome.pdf | link</span></p><textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} rows={7} placeholder={'DC Comics/Batman/HQ 001.pdf | https://drive.google.com/file/d/ID/view\nMarvel/X-Men/HQ 001.pdf | https://drive.google.com/file/d/ID/view'} className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-6 text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-red-500/60" /><button type="button" onClick={handleBatchImport} disabled={importing || !batchText.trim() || !canWrite()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-40">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{importing ? 'Importando...' : 'Importar lista'}</button></div>}
      </section>

      {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-sm text-emerald-300">{message}</div>}
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm leading-5 text-red-300">{error}</div>}

      <section className="border-t border-white/5 pt-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-white">Catálogo atual</h3><p className="mt-1 text-xs text-zinc-600">HQs disponíveis na biblioteca.</p></div><span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-400">{comics.length}</span></div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">{loading ? <div className="flex items-center gap-2 py-5 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo...</div> : sortedComics.length ? sortedComics.map((comic) => <div key={comic.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-zinc-200">{comic.name}</p><p className="mt-0.5 truncate text-[10px] text-zinc-600">{comic.path || comic.category || 'Sem coleção'} · {comic.extension?.toUpperCase()}</p></div><button onClick={() => handleRemove(comic)} disabled={removing === comic.id || !canWrite()} className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30" aria-label={`Remover ${comic.name}`}>{removing === comic.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div>) : <p className="py-5 text-xs text-zinc-600">Nenhuma HQ cadastrada.</p>}</div>
      </section>
    </div>
  );
}
