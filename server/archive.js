import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createRequire } from 'node:module';
import { naturalSort } from './naturalSort.js';
import { imageMimeFromName } from './formats.js';

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;
const require = createRequire(import.meta.url);
let unrarWasmBinary = null;
let createExtractorFromDataFn = null;

function getCreateExtractorFromData() {
  if (createExtractorFromDataFn) return createExtractorFromDataFn;
  try {
    const mod = require('node-unrar-js');
    const factory = mod?.createExtractorFromData || mod?.default?.createExtractorFromData;
    if (typeof factory !== 'function') {
      throw new TypeError('createExtractorFromData não foi exportado pelo node-unrar-js.');
    }
    createExtractorFromDataFn = factory;
    return createExtractorFromDataFn;
  } catch (cause) {
    const e = new Error('Não foi possível carregar o suporte a arquivos CBR (node-unrar-js).');
    e.code = 'UNRAR_MODULE_LOAD_FAILED';
    e.status = 500;
    e.cause = cause;
    throw e;
  }
}

function assertPageCount(names) {
  const max = Number(process.env.MAX_ARCHIVE_PAGES || 1200);
  if (names.length > max) {
    const e = new Error(`A HQ excede o limite de ${max} páginas.`);
    e.code = 'TOO_MANY_PAGES';
    e.status = 413;
    throw e;
  }
}

function loadUnrarWasm() {
  if (unrarWasmBinary) return unrarWasmBinary;
  // Em bundle serverless o node-unrar-js precisa do WASM explicitamente. O
  // includeFiles do vercel.json garante que este arquivo exista em produção.
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/node-unrar-js/dist/js/unrar.wasm'),
    path.resolve(process.cwd(), 'node_modules/node-unrar-js/esm/js/unrar.wasm')
  ];
  const wasmPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    const e = new Error('O módulo de leitura CBR foi publicado sem o arquivo unrar.wasm.');
    e.code = 'UNRAR_WASM_MISSING';
    e.status = 500;
    throw e;
  }
  unrarWasmBinary = new Uint8Array(fs.readFileSync(wasmPath));
  return unrarWasmBinary;
}

export function createCbzReader(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries()
    .filter((entry) => !entry.isDirectory && IMAGE_RE.test(entry.entryName))
    .sort((a, b) => naturalSort(a.entryName, b.entryName));
  assertPageCount(entries);
  return {
    count: entries.length,
    pages: entries.map((entry, index) => ({ index: index + 1, name: entry.entryName, mimeType: imageMimeFromName(entry.entryName) })),
    extract(page) {
      const entry = entries[page.index - 1];
      if (!entry) return null;
      return { name: entry.entryName, mimeType: imageMimeFromName(entry.entryName), data: entry.getData() };
    }
  };
}

export async function createCbrReader(buffer) {
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const createExtractorFromData = getCreateExtractorFromData();
  const extractor = await createExtractorFromData({ wasmBinary: loadUnrarWasm(), data });
  const headers = [...extractor.getFileList().fileHeaders]
    .filter((header) => !header.flags?.directory && IMAGE_RE.test(header.name))
    .sort((a, b) => naturalSort(a.name, b.name));
  assertPageCount(headers);
  return {
    count: headers.length,
    pages: headers.map((header, index) => ({ index: index + 1, name: header.name, mimeType: imageMimeFromName(header.name) })),
    extract(page) {
      const header = headers[page.index - 1];
      if (!header) return null;
      const result = extractor.extract({ files: [header.name] });
      const file = [...result.files].find((item) => item.extraction && item.fileHeader?.name === header.name)
        || [...result.files].find((item) => item.extraction);
      if (!file?.extraction) return null;
      return { name: header.name, mimeType: imageMimeFromName(header.name), data: Buffer.from(file.extraction) };
    }
  };
}

// Mantém as funções antigas para compatibilidade com outros módulos.
export function extractCbz(buffer) {
  const reader = createCbzReader(buffer);
  return reader.pages.map((page) => reader.extract(page)).filter(Boolean);
}

export async function extractCbr(buffer) {
  const reader = await createCbrReader(buffer);
  return reader.pages.map((page) => reader.extract(page)).filter(Boolean);
}
