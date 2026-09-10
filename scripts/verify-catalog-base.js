import fs from 'node:fs/promises';

const raw = await fs.readFile(new URL('../data/initial-library.json', import.meta.url), 'utf8');
const data = JSON.parse(raw);
const files = Array.isArray(data.files) ? data.files : [];
const sources = Array.isArray(data.sources) ? data.sources : [];
if (!files.length) throw new Error('Seed sem HQs.');
if (!sources.length) throw new Error('Seed sem fontes Drive.');
console.log(`CATALOG_BASE_OK files=${files.length} sources=${sources.length}`);
