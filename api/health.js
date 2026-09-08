import { isAdminConfigured } from '../server/auth.js';
import { isBlobConfigured } from '../server/catalog.js';

export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, runtime: 'vercel', blobConfigured: isBlobConfigured(), adminConfigured: isAdminConfigured(), renderRequired: false });
}
