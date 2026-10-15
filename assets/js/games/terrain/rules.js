// Terrain ID — rules. Pure functions (no DOM), unit-tested.
//
// A round shows an unlabelled relief render of a documented place. The player
// places one marker on the world map. Points depend on the distance between
// the marker and the area shown, reduced by each optional hint used.
import { createRng } from '../../core/rng.js';
import { distanceToBBoxKm } from '../../core/geo.js';

export const GAME_ID = 'terrain';
export const TIERS = [1, 2, 3, 4];
export const TIER_LABEL = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile', 4: 'Expert' };
export const ROUND_PLAN = [1, 2, 2, 3, 4]; // daily and "progressive" free games
export const ROUNDS = ROUND_PLAN.length;

/** Free-play levels: progressive, or every round at one tier. */
export const LEVELS = [
  { id: 'mixte', label: 'Progressif', plan: ROUND_PLAN },
  ...TIERS.map((t) => ({ id: String(t), label: TIER_LABEL[t], plan: Array(ROUNDS).fill(t) })),
];
export function levelPlan(levelId) {
  return (LEVELS.find((l) => l.id === levelId) || LEVELS[0]).plan;
}
export const MAX_POINTS = 1000;
export const DECAY_KM = 750;        // score halves roughly every 520 km outside the area
export const HINT_PENALTY = 0.15;   // each hint removes 15 % of the round's maximum
export const MAX_HINTS = 3;

export function buildRounds(places, seed, plan = ROUND_PLAN) {
  const rng = createRng(seed);
  const pools = {};
  for (const tier of TIERS) {
    pools[tier] = rng.shuffle(places.filter((p) => p.tier === tier).map((p) => p.id));
  }
  return plan.map((tier) => ({ id: pools[tier].pop(), tier }));
}

export function hintFactor(hintsUsed) {
  return Math.max(0, 1 - HINT_PENALTY * hintsUsed);
}

/** Highest score still reachable after `hintsUsed` hints. */
export function roundCap(hintsUsed) {
  return Math.round(MAX_POINTS * hintFactor(hintsUsed));
}

export function distanceScore(km) {
  if (km <= 0) return MAX_POINTS;
  return Math.round(MAX_POINTS * Math.exp(-km / DECAY_KM));
}

/** Evaluate a guess {lat, lon} against a place. */
export function scoreGuess(place, guess, hintsUsed) {
  const km = distanceToBBoxKm(guess.lat, guess.lon, place.bbox);
  const score = Math.round(distanceScore(km) * hintFactor(hintsUsed));
  return { km, score, inside: km === 0 };
}

export function maxScore(plan = ROUND_PLAN) {
  return plan.length * MAX_POINTS;
}

/** Share-text symbol of a round: distance band, never the place. */
export function resultSymbol(r) {
  if (r.inside) return '◆';
  if (r.km < 250) return '●';
  if (r.km < 1000) return '◐';
  return '○';
}

export function bboxCenter(bbox) {
  return { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 };
}
