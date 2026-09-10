import { getUnifiedCatalog, getUnifiedComic, publicComicV2 } from './catalogV2.js';

export async function listPublicComics(force = false) {
  const catalog = await getUnifiedCatalog({ force });
  return (catalog.files || []).map(publicComicV2);
}

export async function publicComicById(id) {
  return publicComicV2(await getUnifiedComic(id));
}
