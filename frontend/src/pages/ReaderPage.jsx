import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ErrorMessage from '../components/ErrorMessage.jsx';
import Loading from '../components/Loading.jsx';
import Reader from '../components/Reader.jsx';
import { api } from '../services/api.js';
import { isLocalComicId, localBridge } from '../services/localBridge.js';
import { loadPdf } from '../services/pdf.js';

export default function ReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const local = isLocalComicId(id);

  async function load() {
    setLoading(true); setError(null);
    try {
      if (!local) await api.syncSharedUserState().catch(() => null);
      const comic = local ? await localBridge.getComic(id) : (await api.getComic(id)).comic;
      if (local && (!comic.available || comic.localStatus !== 'local')) throw new Error('Esta HQ ainda não está disponível para leitura. Baixe-a pela Biblioteca e tente novamente.');
      let pages = [];
      let documentUrl = null;
      if (comic.format === 'pdf') {
        documentUrl = local ? localBridge.fileUrl(id) : comic.contentUrl;
        const pdf = await loadPdf(local ? documentUrl : api.assetUrl(documentUrl));
        pages = Array.from({ length: pdf.numPages }, (_, index) => ({ page: index + 1 }));
      } else if (comic.format === 'image') {
        pages = [{ page: 1, url: local ? localBridge.fileUrl(id) : comic.contentUrl }];
      } else if (comic.format === 'cbz' || comic.format === 'cbr') {
        const archive = local ? await localBridge.archive(id) : await api.getArchivePages(id);
        pages = archive.pages || [];
      }
      setData({ comic, pages, documentUrl });
    } catch (err) { setError(local ? new Error('Não foi possível preparar esta HQ para leitura agora. Tente novamente em instantes.') : err); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);
  const back = '/';
  if (loading) return <div className="grid min-h-screen place-items-center bg-zinc-950"><Loading label="Preparando HQ..." /></div>;
  if (error) return <div className="min-h-screen bg-zinc-950 p-4 sm:p-8"><div className="mx-auto max-w-3xl"><button onClick={() => navigate(back)} className="mb-5 text-sm font-semibold text-zinc-400 hover:text-white">← Voltar para biblioteca</button><ErrorMessage error={error} onRetry={load} /></div></div>;
  if (!data?.pages?.length) return <div className="min-h-screen bg-zinc-950 p-8 text-center text-zinc-400">Esta HQ não possui páginas legíveis.</div>;
  return <Reader comic={data.comic} pages={data.pages} documentUrl={data.documentUrl} backTo={back} />;
}
