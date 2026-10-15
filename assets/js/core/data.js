// Loads the static datasets once and shares them between the games.
import { buildCountryIndex } from './countries.js';

const cache = new Map();

function loadJson(path) {
  if (!cache.has(path)) {
    const url = new URL(`../../../${path}`, import.meta.url);
    cache.set(
      path,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Chargement impossible : ${path} (${r.status})`);
        return r.json();
      }),
    );
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
  return countriesPromise;
}

export const getShapes = () => loadJson('data/shapes.json');
export const getWorld = () => loadJson('data/world.json');
export const getPlaces = () => loadJson('data/terrain/places.json');

export function terrainImageUrl(id) {
  return new URL(`../../../data/terrain/${id}.webp`, import.meta.url).href;
}

export const getSatellite = () => loadJson('data/satellite/manifest.json');

export function satelliteTileUrl(level, key) {
  return new URL(`../../../data/satellite/${level}/${key}.webp`, import.meta.url).href;
}
