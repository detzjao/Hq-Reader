function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

const GENERIC_SEGMENTS = new Set([
  'marvel',
  'marvel comics',
  'marvel drive',
  'marvel individual',
  'marvel comics extra',
  'dc',
  'dc comics',
  'turma da monica',
  'outros',
  'drive'
]);

export function comicCategory(comic) {
  return comic?.category || String(comic?.path || '').split('/')[0] || 'Outros';
}

function inferSeriesName(name = '') {
  const clean = String(name || '').replace(/\.[^.]+$/, '').trim();
  if (!clean) return 'Sem série';

  const numberedDash = clean.match(/^(.+?)\s*[-–—]\s*\d{1,4}\s*(?:[-–—]|$)/);
  if (numberedDash?.[1]) return numberedDash[1].trim();

  const issueHash = clean.match(/^(.+?)\s+(?:#|n[º°o.]?\s*)\d{1,4}(?:\b|\s)/i);
  if (issueHash?.[1]) return issueHash[1].trim();

  const trailingIssue = clean.match(/^(.+?)\s+(\d{1,4})(?:\s*[-–—:].*)?$/);
  if (trailingIssue?.[1] && trailingIssue[1].length >= 4) return trailingIssue[1].trim();

  return clean;
}

export function seriesForComic(comic) {
  const category = comicCategory(comic);
  const rawSegments = String(comic?.path || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  const segments = [...rawSegments];
  if (segments.length && normalizeText(segments[0]) === normalizeText(category)) segments.shift();
  while (segments.length && GENERIC_SEGMENTS.has(normalizeText(segments[0]))) segments.shift();

  if (segments.length > 1) {
    const last = normalizeText(segments.at(-1));
    if (/^(?:#?\d{1,4}|(?:vol(?:ume)?|ed(?:icao)?|edicao|numero|n)\.?\s*\d{1,4})\b/.test(last)) segments.pop();
  }

  const name = segments.at(-1) || inferSeriesName(comic?.name);
  const path = segments.length ? `${category}/${segments.join('/')}` : category;
  const key = `${normalizeText(category)}::${normalizeText(path)}::${normalizeText(name)}`;
  return { key, name, path, category };
}

export function groupComicsBySeries(comics = [], readingStates = {}) {
  const groups = new Map();
  for (const comic of comics || []) {
    const info = seriesForComic(comic);
    const previous = groups.get(info.key) || {
      ...info,
      comics: [],
      cover: null,
      started: 0,
      inProgress: 0,
      completed: 0,
      lastReadAt: null
    };
    previous.comics.push(comic);
    if (!previous.cover || (!previous.cover.thumbnailUrl && comic.thumbnailUrl)) previous.cover = comic;
    const reading = readingStates[String(comic.id)];
    if (reading?.started) {
      previous.started += 1;
      if (reading.completed) previous.completed += 1;
      else previous.inProgress += 1;
      const updated = reading.updatedAt || reading.startedAt || null;
      if (updated && (!previous.lastReadAt || Date.parse(updated) > Date.parse(previous.lastReadAt))) previous.lastReadAt = updated;
    }
    groups.set(info.key, previous);
  }

  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      comics: [...group.comics].sort((a, b) => collator.compare(a.name, b.name)),
      cover: group.cover || group.comics[0] || null
    }))
    .sort((a, b) => collator.compare(`${a.category}/${a.name}`, `${b.category}/${b.name}`));
}
