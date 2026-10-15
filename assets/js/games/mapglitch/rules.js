// Map Glitch — rules. Pure functions (no DOM), unit-tested.
//
// A round shows a real country outline (Natural Earth, Mercator-projected)
// deformed by 1 to 3 controlled transformations. Each wrong answer "repairs"
// part of the glitch, so the outline gets closer to the real one.
import { createRng } from '../../core/rng.js';

export const GAME_ID = 'mapglitch';
export const ROUND_PLAN = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]; // difficulty of each round
export const MAX_ATTEMPTS = 3;
export const BASE_POINTS = { 1: 100, 2: 200, 3: 300 };
export const ATTEMPT_FACTOR = [1, 0.6, 0.3]; // 1st, 2nd, 3rd attempt
/** Glitch intensity shown before attempt n (1 = full glitch, 0 = true outline). */
export const INTENSITY = [1, 0.6, 0.3];

export const DIFFICULTY_LABEL = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };

export const TRANSFORM_LABEL = {
  rotate: 'Rotation',
  mirror: 'Miroir',
  stretch: 'Étirement',
  shear: 'Cisaillement',
  wave: 'Ondulation',
  twist: 'Torsion',
  bulge: 'Gonflement',
  slices: 'Décalage de bandes',
};

// Transformation catalogue per difficulty: [type, parameter generator]
const DEG = Math.PI / 180;
const CATALOGUE = {
  1: {
    rotate: (r) => ({ angle: r.sign() * r.range(20, 50) * DEG }),
    stretch: (r) => ({ k: r.sign() * r.range(0.22, 0.38) }),
    shear: (r) => ({ k: r.sign() * r.range(0.22, 0.4), axis: r.pick(['x', 'y']) }),
  },
  2: {
    rotate: (r) => ({ angle: r.sign() * r.range(45, 140) * DEG }),
    mirror: () => ({}),
    stretch: (r) => ({ k: r.sign() * r.range(0.32, 0.55) }),
    shear: (r) => ({ k: r.sign() * r.range(0.3, 0.55), axis: r.pick(['x', 'y']) }),
    wave: (r) => ({ amp: r.range(0.03, 0.05), freq: r.range(1.2, 2.2), phase: r.range(0, 6.28), axis: r.pick(['x', 'y']) }),
    slices: (r) => slicesParams(r, 0.035, 0.06),
  },
  3: {
    rotate: (r) => ({ angle: r.sign() * r.range(90, 180) * DEG }),
    mirror: () => ({}),
    stretch: (r) => ({ k: r.sign() * r.range(0.45, 0.75) }),
    shear: (r) => ({ k: r.sign() * r.range(0.4, 0.75), axis: r.pick(['x', 'y']) }),
    wave: (r) => ({ amp: r.range(0.04, 0.07), freq: r.range(1.5, 2.8), phase: r.range(0, 6.28), axis: r.pick(['x', 'y']) }),
    twist: (r) => ({ k: r.sign() * r.range(0.6, 1.1) }),
    bulge: (r) => ({ k: r.sign() * r.range(0.3, 0.55) }),
    slices: (r) => slicesParams(r, 0.05, 0.09),
  },
};

function slicesParams(r, min, max) {
  const bands = r.int(5, 9);
  const shifts = Array.from({ length: bands }, () => r.sign() * r.range(min * 0.4, max));
  return { bands, shifts, axis: r.pick(['x', 'y']) };
}

/** Pick `difficulty` distinct transformations. */
export function makeGlitch(rng, difficulty) {
  const cat = CATALOGUE[difficulty];
  const types = rng.shuffle(Object.keys(cat)).slice(0, difficulty);
  // keep rotation/mirror last so the warps act on the original orientation
  const order = ['stretch', 'shear', 'wave', 'twist', 'bulge', 'slices', 'mirror', 'rotate'];
  types.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return types.map((type) => ({ type, ...cat[type](rng) }));
}

/**
 * Choose the countries of a game. Each difficulty draws from the matching
 * tier; no country appears twice.
 */
export function buildRounds(countries, seed, plan = ROUND_PLAN) {
  const rng = createRng(seed);
  const pools = {};
  for (const tier of [1, 2, 3]) {
    pools[tier] = rng.shuffle(countries.filter((c) => c.glitch && c.tier === tier).map((c) => c.id));
  }
  return plan.map((difficulty) => {
    const id = pools[difficulty].pop();
    return { id, difficulty, glitch: makeGlitch(rng, difficulty) };
  });
}

/** Points for a round: base by difficulty x attempt factor; 0 if missed. */
export function roundScore(difficulty, attemptsUsed, solved) {
  if (!solved) return 0;
  return Math.round(BASE_POINTS[difficulty] * ATTEMPT_FACTOR[attemptsUsed - 1]);
}

export function maxScore(plan = ROUND_PLAN) {
  return plan.reduce((s, d) => s + BASE_POINTS[d], 0);
}

/** Intensity of the glitch given the number of wrong answers so far. */
export function intensityAfter(wrong) {
  return INTENSITY[Math.min(wrong, INTENSITY.length - 1)];
}

// ---------------------------------------------------------------- geometry

/**
 * Normalise a silhouette ({w, h, rings}) around its centre into unit
 * coordinates (largest dimension = 2) and densify edges so non-linear warps
 * bend smoothly instead of moving only the vertices.
 */
export function prepareShape(shape, maxSeg = 0.02) {
  const cx = shape.w / 2;
  const cy = shape.h / 2;
  const s = 2 / Math.max(shape.w, shape.h);
  return shape.rings.map((ring) => {
    const out = [];
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const x0 = (ring[2 * i] - cx) * s;
      const y0 = (ring[2 * i + 1] - cy) * s;
      const j = (i + 1) % n;
      const x1 = (ring[2 * j] - cx) * s;
      const y1 = (ring[2 * j + 1] - cy) * s;
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / maxSeg));
      for (let k = 0; k < steps; k++) {
        out.push(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps);
      }
    }
    return out;
  });
}

/** Apply one transformation at intensity t (0..1) to a point. */
function transformPoint(tf, t, x, y) {
  switch (tf.type) {
    case 'rotate': {
      const a = tf.angle * t;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [x * c - y * s, x * s + y * c];
    }
    case 'mirror':
      return t >= 0.5 ? [-x, y] : [x, y];
    case 'stretch': {
      const f = 1 + tf.k * t;
      return [x * f, y / f];
    }
    case 'shear':
      return tf.axis === 'x' ? [x + tf.k * t * y, y] : [x, y + tf.k * t * x];
    case 'wave':
      return tf.axis === 'x'
        ? [x, y + tf.amp * t * Math.sin(tf.freq * Math.PI * x + tf.phase)]
        : [x + tf.amp * t * Math.sin(tf.freq * Math.PI * y + tf.phase), y];
    case 'twist': {
      const a = tf.k * t * Math.hypot(x, y);
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [x * c - y * s, x * s + y * c];
    }
    case 'bulge': {
      const r2 = Math.min(1, x * x + y * y);
      const f = 1 + tf.k * t * (1 - r2);
      return [x * f, y * f];
    }
    case 'slices': {
      const along = tf.axis === 'x' ? y : x;
      const band = Math.max(0, Math.min(tf.bands - 1, Math.floor(((along + 1) / 2) * tf.bands)));
      const d = tf.shifts[band] * t;
      return tf.axis === 'x' ? [x + d, y] : [x, y + d];
    }
    default:
      return [x, y];
  }
}

/** Apply the glitch at intensity t to prepared rings. Returns new flat rings. */
export function applyGlitch(rings, glitch, t) {
  return rings.map((ring) => {
    const out = new Array(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      let x = ring[i];
      let y = ring[i + 1];
      for (const tf of glitch) [x, y] = transformPoint(tf, t, x, y);
      out[i] = x;
      out[i + 1] = y;
    }
    return out;
  });
}

/** Bounding box of flat rings: [minX, minY, maxX, maxY]. */
export function ringsBBox(rings) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
  }
  return [x0, y0, x1, y1];
}

/** Share-text symbol of a round result. */
export function resultSymbol(r) {
  return r.solved ? String(r.attempts) : '×';
}

// ------------------------------------------------------- placement mode
// Complementary mode: the country is named, the player clicks where it is on
// a world map without borders. Scored by distance to the country's outline.
export const PLACE_GAME_ID = 'mapglitch-place';
export const PLACE_ROUNDS = 10;
export const PLACE_MAX = 100;
export const PLACE_DECAY_KM = 500;

export function buildPlacementRounds(countries, seed, n = PLACE_ROUNDS) {
  const rng = createRng(seed);
  const plan = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3].slice(0, n);
  const pools = {};
  for (const tier of [1, 2, 3]) {
    pools[tier] = rng.shuffle(countries.filter((c) => c.tier === tier).map((c) => c.id));
  }
  return plan.map((tier) => ({ id: pools[tier].pop(), tier }));
}

/** 100 inside the country, then exponential decay with the distance (km). */
export function placementScore(km) {
  if (km <= 0) return PLACE_MAX;
  return Math.round(PLACE_MAX * Math.exp(-km / PLACE_DECAY_KM));
}

export function placementSymbol(r) {
  if (r.km === 0) return '◆';
  if (r.km < 300) return '●';
  if (r.km < 1000) return '◐';
  return '○';
}
