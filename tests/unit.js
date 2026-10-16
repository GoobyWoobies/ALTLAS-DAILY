import { test, assert, eq, near, run } from './harness.js';
import { createRng, hashString } from '../assets/js/core/rng.js';
import { utcDateKey, dailySeed, daysBetween, addDays } from '../assets/js/core/daily.js';
import { normalize } from '../assets/js/core/text.js';
import { streaks } from '../assets/js/core/storage.js';
import {
  haversineKm, bearingDeg, compassFr, equalEarth, equalEarthInverse,
  pointInPolygon, distanceToPolygonsKm, distanceToBBoxKm,
} from '../assets/js/core/geo.js';
import { getCountries, getShapes, getWorld, getPlaces, terrainImageUrl } from '../assets/js/core/data.js';
import * as MG from '../assets/js/games/mapglitch/rules.js';
import * as TR from '../assets/js/games/terrain/rules.js';
import * as DNA from '../assets/js/games/dna/rules.js';

// ------------------------------------------------------------------ core
test('rng is deterministic for a seed', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const sa = Array.from({ length: 5 }, a.next);
  eq(sa, Array.from({ length: 5 }, b.next));
  assert(JSON.stringify(sa) !== JSON.stringify(Array.from({ length: 5 }, c.next)), 'different seeds differ');
  assert(sa.every((x) => x >= 0 && x < 1), 'range');
});

test('rng helpers stay in bounds', () => {
  const r = createRng(7);
  for (let i = 0; i < 500; i++) {
    const n = r.int(2, 5);
    assert(n >= 2 && n <= 5 && Number.isInteger(n), `int ${n}`);
  }
  const arr = [1, 2, 3, 4, 5, 6];
  eq(r.shuffle(arr).sort(), arr, 'shuffle keeps elements');
});

test('hashString is stable', () => {
  eq(hashString('atlas'), hashString('atlas'));
  assert(hashString('atlas') !== hashString('atlaS'));
});

test('daily key uses UTC', () => {
  eq(utcDateKey(new Date('2026-10-15T23:30:00-05:00')), '2026-10-16');
  eq(utcDateKey(new Date('2026-10-15T00:10:00+02:00')), '2026-10-14');
  eq(dailySeed('mapglitch', '2026-10-15'), dailySeed('mapglitch', '2026-10-15'));
  assert(dailySeed('mapglitch', '2026-10-15') !== dailySeed('terrain', '2026-10-15'));
  assert(dailySeed('dna', '2026-10-15') !== dailySeed('dna', '2026-10-16'));
});

test('date arithmetic', () => {
  eq(daysBetween('2026-02-27', '2026-03-01'), 2);
  eq(addDays('2026-12-31', 1), '2027-01-01');
  eq(addDays('2026-03-01', -1), '2026-02-28');
});

test('streaks', () => {
  eq(streaks(['2026-10-12', '2026-10-13', '2026-10-14'], '2026-10-15'), { streak: 3, bestStreak: 3 });
  eq(streaks(['2026-10-10', '2026-10-13', '2026-10-14', '2026-10-15'], '2026-10-15'), { streak: 3, bestStreak: 3 });
  eq(streaks(['2026-10-01', '2026-10-02'], '2026-10-15'), { streak: 0, bestStreak: 2 });
  eq(streaks([], '2026-10-15'), { streak: 0, bestStreak: 0 });
});

test('normalize', () => {
  eq(normalize('Côte d\'Ivoire'), 'cote d ivoire');
  eq(normalize('  La  France '), 'france');
  eq(normalize('États-Unis'), 'etats unis');
  eq(normalize('São Tomé-et-Príncipe'), 'sao tome et principe');
});

// ------------------------------------------------------------------- geo
test('haversine distances', () => {
  near(haversineKm(48.8566, 2.3522, 51.5074, -0.1278), 344, 3, 'Paris-London');
  near(haversineKm(40.7128, -74.006, 34.0522, -118.2437), 3936, 10, 'NY-LA');
  eq(haversineKm(10, 20, 10, 20), 0);
  near(haversineKm(0, 179.5, 0, -179.5), 111.2, 0.5, 'across antimeridian');
});

test('bearing and compass', () => {
  eq(compassFr(bearingDeg(48.85, 2.35, 52.52, 13.4)), 'NE'); // Paris -> Berlin
  eq(compassFr(bearingDeg(48.85, 2.35, 40.42, -3.7)), 'SO'); // Paris -> Madrid
  eq(compassFr(bearingDeg(0, 0, 10, 0)), 'N');
  eq(compassFr(bearingDeg(0, 0, 0, -10)), 'O');
});

test('equal earth round trip', () => {
  for (let lat = -85; lat <= 85; lat += 17) {
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x, y] = equalEarth(lon, lat);
      const [lo, la] = equalEarthInverse(x, y);
      near(lo, lon, 1e-6, `lon at ${lon},${lat}`);
      near(la, lat, 1e-6, `lat at ${lon},${lat}`);
    }
  }
  eq(equalEarthInverse(10, 0), null, 'outside the map');
});

test('point in polygon with hole', () => {
  const square = [[0, 0, 10, 0, 10, 10, 0, 10], [4, 4, 6, 4, 6, 6, 4, 6]];
  assert(pointInPolygon(2, 2, square));
  assert(!pointInPolygon(5, 5, square), 'hole');
  assert(!pointInPolygon(12, 5, square));
});

test('distance to bbox', () => {
  eq(distanceToBBoxKm(46, 10, [4.8, 43.6, 16.2, 48.4]), 0);
  near(distanceToBBoxKm(0, 1, [0, 0, 0.5, 0.5]), 55.6, 1);
  near(distanceToBBoxKm(10, 0, [-1, -1, 1, 1]), 1000.8, 2);
});

// ------------------------------------------------------------------ data
test('countries dataset integrity', async () => {
  const { list, byId } = await getCountries();
  eq(list.length, 194, 'count');
  for (const c of list) {
    assert(c.name && c.area > 0, `${c.id} name/area`);
    assert(c.highPoint && c.highPoint.elev >= 0, `${c.id} high point`);
    assert(c.lat >= c.latMin - 0.5 && c.lat <= c.latMax + 0.5, `${c.id} centroid within lat range`);
    for (const b of c.borders) assert(byId.get(b)?.borders.includes(c.id), `${c.id}-${b} symmetric`);
    if (c.landlocked) assert(c.borders.length > 0, `${c.id} landlocked needs neighbours`);
  }
  eq(byId.get('FRA').highPoint.elev, 4806);
  eq(byId.get('NPL').highPoint.elev, 8849);
  eq(byId.get('BOL').landlocked, true);
  eq(byId.get('CHN').borders.length, 14);
});

test('country name matching', async () => {
  const { index } = await getCountries();
  eq(index.match('france'), 'FRA');
  eq(index.match('Etats-Unis'), 'USA');
  eq(index.match('USA'), 'USA');
  eq(index.match('Royaume Uni'), 'GBR');
  eq(index.match('RDC'), 'COD');
  eq(index.match('Birmanie'), 'MMR');
  eq(index.match('Germany'), 'DEU');
  eq(index.match('cote divoire'), null, 'no fuzzy match');
  eq(index.match('Côte d\'Ivoire'), 'CIV');
  eq(index.search('allem')[0].id, 'DEU');
  const congo = index.search('congo').map((x) => x.id);
  assert(congo.includes('COD') && congo.includes('COG'), 'both Congos');
  eq(index.search('fra', 8, new Set(['FRA'])).some((x) => x.id === 'FRA'), false, 'exclusion');
});

test('world map polygons locate countries', async () => {
  const world = await getWorld();
  const polys = (id) => world.filter((f) => f.id === id).flatMap((f) => f.p);
  eq(distanceToPolygonsKm(48.8566, 2.3522, polys('FRA')), 0, 'Paris in France');
  eq(distanceToPolygonsKm(-15.79, -47.88, polys('BRA')), 0, 'Brasilia in Brazil');
  const d = distanceToPolygonsKm(50.85, 4.35, polys('FRA'));
  assert(d > 20 && d < 120, `Brussels to France ${d}`);
  near(distanceToPolygonsKm(48.8566, 2.3522, polys('DEU')), 298, 15, 'Paris to the German border (near Perl)');
});

test('derived traits', async () => {
  const { byId } = await getCountries();
  eq(DNA.hemisphereNS(byId.get('BRA')), 'Nord et Sud');
  eq(DNA.hemisphereNS(byId.get('AUS')), 'Sud');
  eq(DNA.hemisphereEW(byId.get('AUS')), 'Est');
  eq(DNA.hemisphereEW(byId.get('FRA')), 'Est et Ouest');
  eq(DNA.hemisphereEW(byId.get('USA')), 'Ouest');
  eq(DNA.hemisphereEW(byId.get('RUS')), 'Est et Ouest', 'Russia crosses 180°');
  eq(DNA.latitudeZone(byId.get('FRA').lat), 'Tempérée');
  eq(DNA.latitudeZone(byId.get('COD').lat), 'Tropicale');
  eq(DNA.latitudeZone(-70), 'Polaire');
  assert(byId.get('CHL').elongation > 4, 'Chile is elongated');
  assert(byId.get('POL').elongation < 1.6, 'Poland is compact');
  const { smaller, larger } = DNA.areaBracket(byId.get('ESP'), byId);
  eq([smaller.id, larger.id], ['DEU', 'FRA']);
  eq(DNA.areaBracket(byId.get('VAT'), byId).smaller, null);
  const kind = (id) => DNA.shapeLabel(byId.get(id)).split(' · ')[1];
  eq(kind('CUB'), 'insulaire');
  eq(kind('CYP'), 'insulaire', 'Cyprus is one island despite the merged features');
  eq(kind('MDV'), 'archipel');
  eq(kind('PHL'), 'archipel');
  eq(kind('AUS'), 'île-continent');
  eq(kind('BOL'), 'enclavé');
  eq(kind('FRA'), 'côtier');
});

// ------------------------------------------------------------ map glitch
test('map glitch rounds', async () => {
  const { list, byId } = await getCountries();
  const r1 = MG.buildRounds(list, 123);
  eq(r1, MG.buildRounds(list, 123), 'deterministic');
  eq(r1.length, 10);
  eq(new Set(r1.map((r) => r.id)).size, 10, 'distinct');
  r1.forEach((r, i) => {
    eq(r.difficulty, MG.ROUND_PLAN[i]);
    eq(byId.get(r.id).tier, r.difficulty, 'tier matches');
    assert(byId.get(r.id).glitch, 'eligible');
    eq(r.glitch.length, r.difficulty, 'transform count');
    eq(new Set(r.glitch.map((g) => g.type)).size, r.glitch.length, 'distinct transforms');
  });
});

test('map glitch geometry', async () => {
  const shapes = await getShapes();
  const base = MG.prepareShape(shapes.ITA);
  const [x0, y0, x1, y1] = MG.ringsBBox(base);
  near(Math.max(x1 - x0, y1 - y0), 2, 0.01, 'normalised size');
  const rng = createRng(5);
  for (const d of [1, 2, 3]) {
    const g = MG.makeGlitch(rng, d);
    const atZero = MG.applyGlitch(base, g, 0);
    eq(atZero, base, `t=0 is identity (difficulty ${d})`);
    const full = MG.applyGlitch(base, g, 1);
    assert(JSON.stringify(full) !== JSON.stringify(base), 'glitch changes the shape');
    const [a, b, c, e] = MG.ringsBBox(full);
    assert(Number.isFinite(a + b + c + e) && c - a > 0.2 && e - b > 0.2, 'shape stays visible');
  }
  const rot = MG.applyGlitch([[1, 0]], [{ type: 'rotate', angle: Math.PI / 2 }], 1);
  near(rot[0][0], 0, 1e-9);
  near(rot[0][1], 1, 1e-9);
  eq(MG.applyGlitch([[1, 2]], [{ type: 'mirror' }], 1), [[-1, 2]]);
  eq(MG.applyGlitch([[1, 2]], [{ type: 'mirror' }], 0.3), [[1, 2]], 'mirror repaired below 0.5');
});

test('map glitch scoring', () => {
  eq(MG.roundScore(1, 1, true), 100);
  eq(MG.roundScore(2, 2, true), 120);
  eq(MG.roundScore(3, 3, true), 90);
  eq(MG.roundScore(3, 3, false), 0);
  eq(MG.maxScore(), 2000);
  eq([0, 1, 2].map(MG.intensityAfter), [1, 0.6, 0.3]);
});

test('placement mode rules', async () => {
  const { list } = await getCountries();
  const r = MG.buildPlacementRounds(list, 3);
  eq(r.length, 10);
  eq(new Set(r.map((x) => x.id)).size, 10);
  eq(MG.placementScore(0), 100);
  near(MG.placementScore(500), 37, 1);
  assert(MG.placementScore(3000) < 1);
});

test('placement mode only offers countries drawn on the map', async () => {
  const { list } = await getCountries();
  const world = await getWorld();
  const drawn = new Set(world.filter((f) => f.id).map((f) => f.id));
  const undrawn = list.filter((c) => !drawn.has(c.id)).map((c) => c.id);
  eq(undrawn, ['MCO', 'NRU'], 'countries without an outline (too small)');
  // same filter as playPlacement: no round may ask for a country absent from the map
  const placeable = list.filter((c) => drawn.has(c.id));
  for (let seed = 1; seed <= 300; seed++) {
    for (const r of MG.buildPlacementRounds(placeable, seed)) assert(drawn.has(r.id), `seed ${seed}: ${r.id}`);
  }
});

// ------------------------------------------------------------- terrain id
test('terrain places dataset', async () => {
  const places = await getPlaces();
  assert(places.length >= 30, 'enough places');
  eq(new Set(places.map((p) => p.id)).size, places.length, 'unique ids');
  for (const p of places) {
    const [w, s, e, n] = p.bbox;
    assert(w < e && s < n && w >= -180 && e <= 180 && s >= -85 && n <= 85, `${p.id} bbox`);
    eq(p.hints.length, 3, `${p.id} hints`);
    assert(new Set(p.hints).size === 3, `${p.id} distinct hints`);
    assert(p.explain.length > 80 && p.name && p.where, `${p.id} texts`);
    assert(TR.TIERS.includes(p.tier), `${p.id} tier`);
  }
  // every free-play level must be able to fill a game with distinct places
  for (const level of TR.LEVELS) {
    for (const t of TR.TIERS) {
      const need = level.plan.filter((x) => x === t).length;
      assert(places.filter((p) => p.tier === t).length >= need, `level ${level.id}, tier ${t} pool`);
    }
  }
  assert(places.length >= 90, 'about ninety places');
});

test('terrain images exist', async () => {
  const places = await getPlaces();
  const missing = [];
  for (const p of places) {
    const r = await fetch(terrainImageUrl(p.id), { method: 'HEAD' });
    if (!r.ok) missing.push(p.id);
  }
  eq(missing, [], 'missing images');
});

test('terrain scoring', async () => {
  const places = await getPlaces();
  const alpes = places.find((p) => p.id === 'alpes');
  eq(TR.scoreGuess(alpes, { lat: 45.83, lon: 6.86 }, 0), { km: 0, score: 1000, inside: true });
  eq(TR.scoreGuess(alpes, { lat: 45.83, lon: 6.86 }, 1).score, 850);
  eq(TR.scoreGuess(alpes, { lat: 45.83, lon: 6.86 }, 3).score, 550);
  const far = TR.scoreGuess(alpes, { lat: -33.9, lon: 151.2 }, 0);
  assert(far.km > 15000 && far.score === 0, 'Sydney is far from the Alps');
  const mid = TR.scoreGuess(alpes, { lat: 41.9, lon: 12.5 }, 0); // Rome
  assert(mid.km > 150 && mid.km < 250 && mid.score > 700 && mid.score < 850, `Rome ${mid.km} ${mid.score}`);
  let prev = 1001;
  for (let km = 0; km < 5000; km += 250) {
    const s = TR.distanceScore(km);
    assert(s <= prev, 'monotonic');
    prev = s;
  }
  eq(TR.roundCap(2), 700);
  const rounds = TR.buildRounds(places, 99);
  eq(rounds, TR.buildRounds(places, 99));
  eq(new Set(rounds.map((r) => r.id)).size, 5);
  rounds.forEach((r, i) => eq(places.find((p) => p.id === r.id).tier, TR.ROUND_PLAN[i]));
  eq(TR.ROUND_PLAN, [1, 2, 2, 3, 4], 'daily goes through the four levels');
  const expert = TR.buildRounds(places, 7, TR.levelPlan('4'));
  eq(new Set(expert.map((r) => r.id)).size, 5);
  assert(expert.every((r) => places.find((p) => p.id === r.id).tier === 4), 'expert-only game');
  eq(TR.levelPlan('nope'), TR.ROUND_PLAN, 'unknown level falls back to progressive');
});

// ----------------------------------------------------------- country dna
test('dna comparisons', async () => {
  const { byId } = await getCountries();
  const c = DNA.compare(byId.get('FRA'), byId.get('ESP'));
  eq(c.direction, 'SO', 'Spain is south-west of France');
  eq(c.area, -1, 'Spain is smaller');
  eq(c.isNeighbor, true);
  eq(c.sameContinent, true);
  assert(c.km > 500 && c.km < 1100, `km ${c.km}`);
  const d = DNA.compare(byId.get('BRA'), byId.get('NPL'));
  eq(d.highPoint, 1, 'Nepal is higher');
  eq(d.sameCoast, false);
  eq(d.sameContinent, false);
  eq(DNA.compare(byId.get('ITA'), byId.get('ITA')).correct, true);
});

test('dna reveal and scoring', () => {
  eq(DNA.visibleTraits(0).length, 4);
  eq(DNA.visibleTraits(2), [...DNA.INITIAL_TRAITS, 'zone', 'highPoint']);
  eq(DNA.visibleTraits(9).length, 9);
  assert(DNA.visibleTraits(0, true).includes('position'));
  eq(DNA.roundScore(1, true), 1000);
  eq(DNA.roundScore(6, true), 250);
  eq(DNA.roundScore(6, false), 0);
  eq(DNA.maxScore(), 3000);
  eq(DNA.REVEAL_ORDER.length, DNA.MAX_ATTEMPTS - 1, 'one reveal per wrong guess');
});

// ---------------------------------------------------------- dailies, a year
test('a year of dailies is valid for every game', async () => {
  const { list } = await getCountries();
  const places = await getPlaces();
  let key = '2026-01-01';
  for (let i = 0; i < 366; i++) {
    const mg = MG.buildRounds(list, dailySeed(MG.GAME_ID, key));
    const tr = TR.buildRounds(places, dailySeed(TR.GAME_ID, key));
    const dn = DNA.buildRounds(list, dailySeed(DNA.GAME_ID, key));
    assert(mg.every((r) => r.id), `mapglitch ${key}`);
    assert(tr.every((r) => r.id), `terrain ${key}`);
    assert(dn.every((r) => r.id), `dna ${key}`);
    key = addDays(key, 1);
  }
});

run();
