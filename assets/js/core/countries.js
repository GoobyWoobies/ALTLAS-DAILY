// Name matching and autocomplete over the country list.
import { normalize } from './text.js';

/**
 * Builds a search index. Each country is reachable by its French name, its
 * English name and the aliases of the dataset (official names, common
 * alternatives such as "RDC" or "Birmanie").
 */
export function buildCountryIndex(list) {
  const exact = new Map(); // normalized key -> id
  const entries = list.map((c) => {
    const keys = [...new Set([c.name, c.nameEn, ...c.aliases].map(normalize).filter(Boolean))];
    return { id: c.id, label: c.name, labelKey: normalize(c.name), keys };
  });
  // French and English names win over aliases when two countries share a key
  for (const pass of ['primary', 'alias']) {
    for (const e of entries) {
      const c = list.find((x) => x.id === e.id);
      const keys = pass === 'primary' ? [normalize(c.name), normalize(c.nameEn)] : e.keys;
      for (const k of keys) if (!exact.has(k)) exact.set(k, e.id);
    }
  }
  entries.sort((a, b) => a.labelKey.localeCompare(b.labelKey));

  return {
    /** id of the country exactly named by `input`, or null */
    match(input) {
      return exact.get(normalize(input)) ?? null;
    },
    /** up to `limit` suggestions [{id, label}] for a partial input */
    search(input, limit = 8, exclude = new Set()) {
      const q = normalize(input);
      if (!q) return [];
      const scored = [];
      for (const e of entries) {
        if (exclude.has(e.id)) continue;
        let score = -1;
        for (const k of e.keys) {
          let s = -1;
          if (k === q) s = 100;
          else if (k.startsWith(q)) s = 80;
          else if (k.split(' ').some((w) => w.startsWith(q))) s = 60;
          else if (q.length >= 3 && k.includes(q)) s = 40;
          if (k === e.labelKey && s > 0) s += 5; // prefer hits on the displayed name
          score = Math.max(score, s);
        }
        if (score > 0) scored.push({ score, e });
      }
      scored.sort((a, b) => b.score - a.score || a.e.labelKey.localeCompare(b.e.labelKey));
      return scored.slice(0, limit).map(({ e }) => ({ id: e.id, label: e.label }));
    },
  };
}
