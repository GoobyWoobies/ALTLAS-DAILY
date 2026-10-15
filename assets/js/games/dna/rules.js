// Country DNA — rules. Pure functions (no DOM), unit-tested.
//
// The player identifies a country from its geographic profile. Some traits
// are visible from the start; each wrong guess reveals one more and returns a
// comparison between the guess and the mystery country (distance, direction,
// area, borders, elevation...). Every value comes from data/countries.json.
import { createRng } from '../../core/rng.js';
import { haversineKm, bearingDeg, compassFr, compassFrLong } from '../../core/geo.js';

export const GAME_ID = 'dna';
export const ROUND_PLAN = [1, 2, 3];
export const MAX_ATTEMPTS = 6;
export const SCORES = [1000, 850, 700, 550, 400, 250]; // by attempt number
export const DIFFICULTY_LABEL = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };

/** Traits visible from the start, then revealed one per wrong guess. */
export const INITIAL_TRAITS = ['area', 'neighbors', 'coast', 'hemisphere'];
export const REVEAL_ORDER = ['zone', 'highPoint', 'continent', 'shape', 'silhouette'];

/** Reference countries used to put an area in perspective (ascending area). */
const AREA_REFS = ['LUX', 'BEL', 'CHE', 'PRT', 'GBR', 'ITA', 'DEU', 'FRA', 'EGY', 'MEX', 'IND', 'ARG', 'AUS', 'BRA', 'CAN', 'RUS'];

export function buildRounds(countries, seed, plan = ROUND_PLAN) {
  const rng = createRng(seed);
  const pools = {};
  for (const tier of [1, 2, 3]) {
    pools[tier] = rng.shuffle(countries.filter((c) => c.tier === tier && c.highPoint).map((c) => c.id));
  }
  return plan.map((tier) => ({ id: pools[tier].pop(), tier }));
}

export function visibleTraits(wrongGuesses, finished = false) {
  if (finished) return [...INITIAL_TRAITS, ...REVEAL_ORDER, 'subregion', 'position'];
  return [...INITIAL_TRAITS, ...REVEAL_ORDER.slice(0, Math.min(wrongGuesses, REVEAL_ORDER.length))];
}

export function roundScore(attemptsUsed, solved) {
  return solved ? SCORES[attemptsUsed - 1] : 0;
}

export function maxScore(plan = ROUND_PLAN) {
  return plan.length * SCORES[0];
}

// ------------------------------------------------------------ derived traits

export function hemisphereNS(c) {
  if (c.latMin >= 0) return 'Nord';
  if (c.latMax <= 0) return 'Sud';
  return 'Nord et Sud';
}

/** Crossing the antimeridian shows up as lonMin > lonMax (longitudes are wrapped). */
export function hemisphereEW(c) {
  if (c.lonMin > c.lonMax) return 'Est et Ouest';
  if (c.lonMin >= 0) return 'Est';
  if (c.lonMax <= 0) return 'Ouest';
  return 'Est et Ouest';
}

export function hemisphereNote(c) {
  if (c.lonMin > c.lonMax) return 'traversé par l\'antiméridien (180°)';
  if (c.latMin < 0 && c.latMax > 0) return 'traversé par l\'équateur';
  if (c.lonMin < 0 && c.lonMax > 0) return 'traversé par le méridien de Greenwich';
  return '';
}

/** Theoretical climate zone from the latitude of the main territory's centre. */
export function latitudeZone(lat) {
  const a = Math.abs(lat);
  if (a < 23.44) return 'Tropicale';
  if (a < 35) return 'Subtropicale';
  if (a < 55) return 'Tempérée';
  if (a < 66.56) return 'Froide (subpolaire)';
  return 'Polaire';
}

export function shapeLabel(c) {
  const e = c.elongation;
  const form = e < 1.6 ? 'Compacte' : e < 2.6 ? 'Allongée' : 'Très allongée';
  let kind;
  if (c.landlocked) kind = 'enclavé';
  else if (c.borders.length > 0) kind = 'côtier';
  else if (c.area > 2000000) kind = 'île-continent';
  // archipelago: no single island holds three quarters of the land
  else kind = c.mainShare < 0.75 ? 'archipel' : 'insulaire';
  return `${form} · ${kind}`;
}

export function formatPosition(lat, lon) {
  const la = `${Math.abs(Math.round(lat))}° ${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(Math.round(lon))}° ${lon >= 0 ? 'E' : 'O'}`;
  return `≈ ${la}, ${lo}`;
}

/** {smaller, larger}: the reference countries just below and above in area. */
export function areaBracket(c, byId) {
  let smaller = null;
  let larger = null;
  for (const id of AREA_REFS) {
    if (id === c.id) continue;
    const r = byId.get(id);
    if (!r) continue;
    if (r.area < c.area) smaller = r;
    else if (!larger) larger = r;
  }
  return { smaller, larger };
}

// ------------------------------------------------------------- comparisons

function cmp(a, b) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

/**
 * Compare a guess with the mystery country. Every field tells the player how
 * the MYSTERY country relates to the guess (e.g. area: 1 = mystery is larger).
 */
export function compare(guess, target) {
  const same = guess.id === target.id;
  const km = same ? 0 : haversineKm(guess.lat, guess.lon, target.lat, target.lon);
  const bearing = same ? null : bearingDeg(guess.lat, guess.lon, target.lat, target.lon);
  return {
    id: guess.id,
    correct: same,
    km,
    bearing,
    direction: bearing === null ? '' : compassFr(bearing),
    directionLong: bearing === null ? '' : compassFrLong(bearing),
    area: cmp(target.area, guess.area),
    areaRatio: target.area / guess.area,
    neighbors: cmp(target.borders.length, guess.borders.length),
    highPoint: cmp(target.highPoint?.elev ?? 0, guess.highPoint?.elev ?? 0),
    sameContinent: guess.continent === target.continent,
    sameCoast: guess.landlocked === target.landlocked,
    isNeighbor: target.borders.includes(guess.id),
  };
}

/** Share-text summary of a round. */
export function resultSymbol(r) {
  return r.solved ? `${r.attempts}/${MAX_ATTEMPTS}` : `×/${MAX_ATTEMPTS}`;
}
