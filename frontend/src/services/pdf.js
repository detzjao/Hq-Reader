import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const documentCache = new Map();

export function loadPdf(url) {
  if (!documentCache.has(url)) {
    documentCache.set(url, pdfjsLib.getDocument({ url, withCredentials: false }).promise);
  }
  return documentCache.get(url);
}
