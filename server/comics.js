import { getCatalog, getComic, publicComic } from './catalog.js';

export async function listPublicComics(force = false) {
  const catalog = await getCatalog({ force });
  return catalog.files.map(publicComic);
}

export async function publicComicById(id) {
  return publicComic(await getComic(id));
}
