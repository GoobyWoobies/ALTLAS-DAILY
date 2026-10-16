// Loads the static datasets once and shares them between the games.
import { buildCountryIndex } from './countries.js';

const cache = new Map();

/** Error of a dataset that could not be loaded (network failure, HTTP error, invalid JSON). */
export class LoadError extends Error {
  constructor(path, detail) {
    super(`Chargement impossible : ${path} (${detail})`);
    this.name = 'LoadError';
    this.path = path;
  }
}

function loadJson(path) {
  if (!cache.has(path)) {
    const url = new URL(`../../../${path}`, import.meta.url);
    const p = fetch(url)
      .catch(() => {
        throw new LoadError(path, 'réseau indisponible');
      })
      .then((r) => {
        if (!r.ok) throw new LoadError(path, r.status);
        return r.json().catch(() => {
          throw new LoadError(path, 'fichier invalide');
        });
      });
    // a failed request is not cached: the next screen that needs it tries again (once)
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}

let countriesPromise = null;
/** { list, byId, index } */
export function getCountries() {
  countriesPromise ??= loadJson('data/countries.json').then((list) => {
    const byId = new Map(list.map((c) => [c.id, c]));
    return { list, byId, index: buildCountryIndex(list) };
  });
  countriesPromise.catch(() => {
    countriesPromise = null;
  });
  return countriesPromise;
}

export const getShapes = () => loadJson('data/shapes.json');
export const getWorld = () => loadJson('data/world.json');
export const getPlaces = () => loadJson('data/terrain/places.json');

export function terrainImageUrl(id) {
  return new URL(`../../../data/terrain/${id}.webp`, import.meta.url).href;
}

export const getRelief = () => loadJson('data/relief/manifest.json');

export function reliefTileUrl(level, key) {
  return new URL(`../../../data/relief/${level}/${key}.webp`, import.meta.url).href;
}
