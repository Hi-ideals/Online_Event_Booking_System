import crypto from 'node:crypto';

export function slugify(text) {
  return text
    .toString()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** URL slug with a short random suffix so identical titles never collide. */
export function uniqueSlug(text) {
  const base = slugify(text) || 'event';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}
