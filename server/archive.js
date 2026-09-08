import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import { naturalSort } from './naturalSort.js';
import { imageMimeFromName } from './formats.js';

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;

function assertPageCount(names) {
  const max = Number(process.env.MAX_ARCHIVE_PAGES || 1200);
  if (names.length > max) { const e = new Error(`A HQ excede o limite de ${max} páginas.`); e.code = 'TOO_MANY_PAGES'; e.status = 413; throw e; }
}

export function extractCbz(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory && IMAGE_RE.test(entry.entryName)).sort((a, b) => naturalSort(a.entryName, b.entryName));
  assertPageCount(entries);
  return entries.map((entry) => ({ name: entry.entryName, mimeType: imageMimeFromName(entry.entryName), data: entry.getData() }));
}

export async function extractCbr(buffer) {
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const extractor = await createExtractorFromData({ data });
  const headers = [...extractor.getFileList().fileHeaders].filter((header) => !header.flags?.directory && IMAGE_RE.test(header.name)).sort((a, b) => naturalSort(a.name, b.name));
  assertPageCount(headers);
  const result = extractor.extract({ files: headers.map((header) => header.name) });
  const byName = new Map([...result.files].filter((file) => file.extraction).map((file) => [file.fileHeader?.name, Buffer.from(file.extraction)]));
  return headers.map((header) => ({ name: header.name, mimeType: imageMimeFromName(header.name), data: byName.get(header.name) })).filter((item) => item.data);
}
