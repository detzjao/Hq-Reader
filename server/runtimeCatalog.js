import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const RUNTIME_PATH = path.resolve(DATA_DIR, 'runtime-library.local.json');
let cache = null;

function emptyRuntime() {
  return { version: 1, updatedAt: null, files: [], sourceStatuses: {} };
}

export async function readRuntimeCatalog({ force = false } = {}) {
  if (!force && cache) return cache;
  try {
    const raw = await fs.readFile(RUNTIME_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cache = {
      version: Number(parsed?.version || 1),
      updatedAt: parsed?.updatedAt || null,
      files: Array.isArray(parsed?.files) ? parsed.files : [],
      sourceStatuses: parsed?.sourceStatuses && typeof parsed.sourceStatuses === 'object' ? parsed.sourceStatuses : {}
    };
  } catch {
    cache = emptyRuntime();
  }
  return cache;
}

async function atomicWrite(value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temp = `${RUNTIME_PATH}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, RUNTIME_PATH);
}

export async function mergeRuntimeFiles(files = []) {
  const current = await readRuntimeCatalog({ force: true });
  const byId = new Map((current.files || []).filter((file) => file?.id).map((file) => [String(file.id), file]));
  for (const file of files || []) {
    if (!file?.id) continue;
    const id = String(file.id);
    byId.set(id, { ...(byId.get(id) || {}), ...file, id });
  }
  const next = { ...current, updatedAt: new Date().toISOString(), files: [...byId.values()] };
  try {
    await atomicWrite(next);
    cache = next;
    return true;
  } catch (error) {
    console.warn('[RUNTIME_CATALOG_WRITE_FAILED]', error?.message || error);
    return false;
  }
}

export async function saveRuntimeSourceStatus(status) {
  if (!status?.id) return false;
  const current = await readRuntimeCatalog({ force: true });
  const next = {
    ...current,
    updatedAt: new Date().toISOString(),
    sourceStatuses: {
      ...(current.sourceStatuses || {}),
      [String(status.id)]: { ...status, syncedAt: status.syncedAt || new Date().toISOString() }
    }
  };
  try {
    await atomicWrite(next);
    cache = next;
    return true;
  } catch (error) {
    console.warn('[RUNTIME_STATUS_WRITE_FAILED]', error?.message || error);
    return false;
  }
}

export function runtimeCatalogPath() {
  return RUNTIME_PATH;
}
