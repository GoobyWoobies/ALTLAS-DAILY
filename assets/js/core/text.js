// Text helpers for matching player input against country names.

const LEADING_ARTICLES = /^(the|le|la|les|l) /;

/** Lowercase, strip accents and punctuation, collapse spaces, drop a leading article. */
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(LEADING_ARTICLES, '');
}

export function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const nf = new Intl.NumberFormat('fr-FR');
export function formatInt(n) {
  return nf.format(Math.round(n));
}

/** Areas below 100 km² keep two decimals (Vatican: 0,44 km²). */
export function formatArea(km2) {
  return km2 >= 100 ? nf.format(Math.round(km2)) : km2.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}
