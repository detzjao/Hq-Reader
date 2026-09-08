const documentCache = new Map();
let pdfJsPromise = null;

function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === 'function') return;
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const ios = /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return ios && safari;
}

async function getPdfJs() {
  if (!pdfJsPromise) {
    ensurePromiseWithResolvers();
    pdfJsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    ]).then(([pdfjsLib, workerModule]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjsLib;
    });
  }
  return pdfJsPromise;
}

function waitForDocument(task, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      try { task.destroy(); } catch {}
      reject(new Error('O PDF demorou demais para abrir. Tente novamente.'));
    }, timeoutMs);

    task.promise.then(
      (pdf) => {
        window.clearTimeout(timer);
        resolve(pdf);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function openPdf(url) {
  const pdfjsLib = await getPdfJs();
  const iosSafari = isIOSSafari();

  const task = pdfjsLib.getDocument({
    url,
    withCredentials: false,
    rangeChunkSize: iosSafari ? 131072 : 65536,
    // No Safari do iOS, ReadableStream contínuo pode travar em PDFs grandes.
    // Desativando stream, o PDF.js usa requisições Range, que são mais estáveis.
    ...(iosSafari ? { disableStream: true } : {})
  });

  return waitForDocument(task, iosSafari ? 45_000 : 90_000);
}

export function loadPdf(url) {
  if (!documentCache.has(url)) {
    const loading = openPdf(url).catch((error) => {
      documentCache.delete(url);
      throw error;
    });
    documentCache.set(url, loading);
  }
  return documentCache.get(url);
}
