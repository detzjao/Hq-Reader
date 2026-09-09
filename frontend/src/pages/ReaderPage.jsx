import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ErrorMessage from '../components/ErrorMessage.jsx';
import Loading from '../components/Loading.jsx';
import Reader from '../components/Reader.jsx';
import { api } from '../services/api.js';
import { loadPdf } from '../services/pdf.js';

export default function ReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setError(null);
    try {
      await api.syncSharedUserState().catch(() => null);
      const response = await api.getComic(id);
      const comic = response.comic;
      let pages = [];
      let documentUrl = null;
      if (comic.format === 'pdf') {
        documentUrl = comic.contentUrl;
        const pdf = await loadPdf(api.assetUrl(documentUrl));
        pages = Array.from({ length: pdf.numPages }, (_, index) => ({ page: index + 1 }));
      } else if (comic.format === 'image') {
        pages = [{ page: 1, url: comic.contentUrl }];
      } else if (comic.format === 'cbz' || comic.format === 'cbr') {
        const archive = await api.getArchivePages(id);
        pages = archive.pages || [];
      }
      setData({ comic, pages, documentUrl });
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-zinc-950"><Loading label="Preparando HQ..." /></div>;
  if (error) return <div className="min-h-screen bg-zinc-950 p-4 sm:p-8"><div className="mx-auto max-w-3xl"><button onClick={() => navigate('/')} className="mb-5 text-sm font-semibold text-zinc-400 hover:text-white">← Voltar para biblioteca</button><ErrorMessage error={error} onRetry={load} /></div></div>;
  if (!data?.pages?.length) return <div className="min-h-screen bg-zinc-950 p-8 text-center text-zinc-400">Esta HQ não possui páginas legíveis.</div>;
  return <Reader comic={data.comic} pages={data.pages} documentUrl={data.documentUrl} />;
}
