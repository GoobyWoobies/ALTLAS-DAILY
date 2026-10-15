// End-to-end scenarios: plays the real UI inside an iframe, the way a player
// would (typing, Enter, clicks on the map), and checks scores and storage.
// The daily seed is public, so the test knows the expected answers.
import { test, assert, eq, near, run } from './harness.js';
import { utcDateKey, dailySeed } from '../assets/js/core/daily.js';
import { equalEarth } from '../assets/js/core/geo.js';
import * as MG from '../assets/js/games/mapglitch/rules.js';
import * as TR from '../assets/js/games/terrain/rules.js';
import * as DNA from '../assets/js/games/dna/rules.js';

const frame = document.getElementById('app');
const today = utcDateKey();
const errors = [];
let countries;
let places;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, timeout = 8000) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${what}`);
    await sleep(40);
  }
}
const doc = () => frame.contentDocument;
const win = () => frame.contentWindow;
const $ = (sel) => doc().querySelector(sel);
const $$ = (sel) => [...doc().querySelectorAll(sel)];

async function open(hash) {
  frame.src = `../index.html?t=${Date.now()}${hash}`;
  await waitFor(() => doc()?.readyState === 'complete' && $('.site-header'), `page ${hash}`);
  win().addEventListener('error', (e) => errors.push(`${hash}: ${e.message}`));
  win().addEventListener('unhandledrejection', (e) => errors.push(`${hash}: ${e.reason}`));
}

function click(el) {
  el.dispatchEvent(new (win().MouseEvent)('click', { bubbles: true }));
}
function button(text) {
  return $$('button').find((b) => b.textContent.includes(text) && !b.disabled);
}

async function answer(name) {
  const input = await waitFor(() => $('.ci-input:not([disabled])'), 'answer input');
  input.value = name;
  input.dispatchEvent(new (win().Event)('input', { bubbles: true }));
  input.dispatchEvent(new (win().KeyboardEvent)('keydown', { key: 'Enter', bubbles: true }));
  await sleep(30);
}

function headerScore() {
  return Number($('.gf-score').textContent.replace(/\D/g, ''));
}

function stored() {
  return JSON.parse(win().localStorage.getItem('atlas-daily:v1'));
}

async function next() {
  const b = await waitFor(() => button('Manche suivante') || button('Fiche suivante') || button('Voir le résultat'), 'next button');
  click(b);
  await sleep(30);
}

/** Click a lon/lat on the interactive world map (same maths as the component). */
function clickMap(lat, lon, sel = '.tr-map .wm-svg') {
  const svg = $(sel);
  const vb = svg.viewBox.baseVal;
  const r = svg.getBoundingClientRect();
  const u = Math.max(vb.width / r.width, vb.height / r.height);
  const offX = (r.width - vb.width / u) / 2;
  const offY = (r.height - vb.height / u) / 2;
  const [px, py] = equalEarth(lon, lat);
  const clientX = r.left + offX + (px * 100 - vb.x) / u;
  const clientY = r.top + offY + (-py * 100 - vb.y) / u;
  const P = win().PointerEvent;
  svg.dispatchEvent(new P('pointerdown', { bubbles: true, pointerId: 7, clientX, clientY, isPrimary: true }));
  svg.dispatchEvent(new P('pointerup', { bubbles: true, pointerId: 7, clientX, clientY, isPrimary: true }));
}

const nameOf = (id) => countries.find((c) => c.id === id).name;
const otherThan = (ids) => countries.find((c) => !ids.includes(c.id));

// ------------------------------------------------------------------ setup
test('setup', async () => {
  countries = await (await fetch('../data/countries.json')).json();
  places = await (await fetch('../data/terrain/places.json')).json();
  localStorage.removeItem('atlas-daily:v1');
  await open('#/');
  eq($$('.game-row').length, 3, 'three games on the home page');
});

// -------------------------------------------------------------- map glitch
test('map glitch: full daily game', async () => {
  const rounds = MG.buildRounds(countries, dailySeed(MG.GAME_ID, today));
  await open('#/map-glitch');
  click(await waitFor(() => $('[data-action="daily"]'), 'daily button'));
  await waitFor(() => $('.mg-sil path')?.getAttribute('d'), 'silhouette');

  let expected = 0;
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    eq($('.gf-progress').textContent, `Manche ${i + 1}/10`);
    if (i === 0) {
      // unknown name: no attempt used
      await answer('Atlantide');
      assert($('.ci-msg').textContent.includes('introuvable'), 'unknown name message');
      eq($$('.pip.used').length, 0, 'unknown name costs nothing');
      const before = $('.mg-sil path').getAttribute('d');
      const wrong = otherThan([r.id]);
      await answer(wrong.name);
      eq($$('.pip.used').length, 1, 'one attempt used');
      assert($('.hints').textContent.includes(countries.find((c) => c.id === r.id).continent), 'continent hint');
      await sleep(900);
      assert($('.mg-sil path').getAttribute('d') !== before, 'glitch reduced after a wrong answer');
      await answer(wrong.name);
      eq($('.ci-msg').textContent, 'Déjà proposé.', 'duplicate guess refused');
      eq($$('.pip.used').length, 1, 'duplicate costs nothing');
      await answer(nameOf(r.id));
      expected += MG.roundScore(r.difficulty, 2, true);
    } else if (i === 1) {
      // three wrong answers -> round lost
      const wrongs = countries.filter((c) => c.id !== r.id).slice(5, 8);
      for (const w of wrongs) await answer(w.name);
      assert($('.verdict.ko'), 'lost verdict');
    } else if (i === 2) {
      click(button('Passer'));
      assert($('.verdict.ko'), 'skipped round lost');
    } else {
      await answer(nameOf(r.id));
      expected += MG.roundScore(r.difficulty, 1, true);
    }
    await waitFor(() => $('.reveal-name'), 'reveal');
    eq($('.reveal-name').textContent, nameOf(r.id), 'revealed country');
    eq(headerScore(), expected, `score after round ${i + 1}`);
    await next();
  }
  await waitFor(() => $('.results'), 'results screen');
  eq(Number($('.big-num').textContent.replace(/\D/g, '')), expected, 'final score');
  const s = stored();
  eq(s.daily.mapglitch[today].done, true, 'daily stored as done');
  eq(s.daily.mapglitch[today].score, expected);
  eq(s.games.mapglitch.played, 1, 'stats recorded once');
  assert($('.share-preview').textContent.includes(`${expected} / 2000`), 'share text');
  assert(!$('.share-preview').textContent.includes(nameOf(rounds[0].id)), 'share text hides answers');

  // the daily cannot be replayed: it opens the result
  await open('#/map-glitch');
  const dailyBtn = await waitFor(() => $('[data-action="daily"]'), 'daily button');
  assert(dailyBtn.textContent.includes('Voir le résultat'), 'done label');
  click(dailyBtn);
  await waitFor(() => $('.results'), 'results again');
  eq(Number($('.big-num').textContent.replace(/\D/g, '')), expected, 'same score on review');
  eq(stored().games.mapglitch.played, 1, 'reviewing does not count a new game');
});

test('map glitch: free game starts and resumes nothing', async () => {
  await open('#/map-glitch');
  click(await waitFor(() => $('[data-action="free"]'), 'free button'));
  await waitFor(() => $('.mg-sil path')?.getAttribute('d'), 'silhouette');
  eq($('.gf-mode').textContent, 'Partie libre');
  eq(headerScore(), 0);
});

test('daily in-round progress survives a reload', async () => {
  win().localStorage.removeItem('atlas-daily:v1');
  const rounds = DNA.buildRounds(countries, dailySeed(DNA.GAME_ID, today));
  await open('#/country-dna');
  click(await waitFor(() => $('[data-action="daily"]'), 'daily button'));
  await waitFor(() => $('.dna-card'), 'card');
  await answer(otherThan([rounds[0].id]).name);
  eq($$('.dna-guess').length, 1);
  await open('#/country-dna');
  const b = await waitFor(() => $('[data-action="daily"]'), 'daily button');
  assert(b.textContent.includes('Reprendre'), 'resume label');
  click(b);
  await waitFor(() => $('.dna-card'), 'card');
  eq($$('.dna-guess').length, 1, 'wrong guess restored after reload');
  eq($$('.pip.used').length, 1, 'attempt still used');
  win().localStorage.removeItem('atlas-daily:v1');
});

// ----------------------------------------------------------------- terrain
test('terrain id: full daily game', async () => {
  const rounds = TR.buildRounds(places, dailySeed(TR.GAME_ID, today));
  await open('#/terrain-id');
  click(await waitFor(() => $('[data-action="daily"]'), 'daily button'));
  let total = 0;
  for (let i = 0; i < rounds.length; i++) {
    const p = places.find((x) => x.id === rounds[i].id);
    const img = await waitFor(() => $('.zi-img'), 'relief image');
    await waitFor(() => img.complete && img.naturalWidth > 0, `image ${p.id} loaded`);
    await waitFor(() => $('.tr-map path.wm-land'), 'world map');
    const validate = button('Valider');
    assert(!validate, 'validate disabled before a pick');
    let hints = 0;
    if (i === 0) {
      click(button('Indice 1'));
      click(button('Indice 2'));
      hints = 2;
      eq($$('.hint-item').length, 2, 'two hints shown');
      eq($$('.hint-item')[0].textContent.includes(p.hints[0]), true, 'hint text');
      assert($('.cap').textContent.includes('700'), 'cap after two hints');
    }
    const [w, s, e, n] = p.bbox;
    const guess = i === 1 ? { lat: -20, lon: -140 } : { lat: (s + n) / 2, lon: (w + e) / 2 };
    clickMap(guess.lat, guess.lon);
    click(await waitFor(() => button('Valider'), 'validate enabled'));
    await waitFor(() => $('.reveal-name'), 'reveal');
    eq($('.reveal-name').textContent, p.name);
    const exp = TR.scoreGuess(p, guess, hints);
    const got = stored().daily.terrain[today].results[i];
    if (i === 1) {
      near(got.km, exp.km, 30, 'far guess distance');
      near(got.score, exp.score, 5, 'far guess score');
    } else {
      eq(got.inside, true, `inside ${p.id}`);
      eq(got.score, exp.score, `score ${p.id}`);
    }
    total += got.score;
    eq(headerScore(), total, 'header score');
    await next();
  }
  await waitFor(() => $('.results'), 'results');
  eq(Number($('.big-num').textContent.replace(/\D/g, '')), total);
  eq(stored().daily.terrain[today].done, true);
});

// ------------------------------------------------------------- country dna
test('country dna: full daily game', async () => {
  const rounds = DNA.buildRounds(countries, dailySeed(DNA.GAME_ID, today));
  await open('#/country-dna');
  click(await waitFor(() => $('[data-action="daily"]'), 'daily button'));
  await waitFor(() => $('.dna-card'), 'card');
  let expected = 0;
  for (let i = 0; i < rounds.length; i++) {
    const target = countries.find((c) => c.id === rounds[i].id);
    eq($('.dna-name').textContent, 'Pays mystère', 'name hidden');
    eq($$('.trait:not(.locked)').length, 4, 'four traits visible');
    assert(!$('.dna-card').textContent.includes(target.name), 'name absent from the card');
    if (i === 0) {
      const g = otherThan([target.id]);
      await answer(g.name);
      eq($$('.trait:not(.locked)').length, 5, 'one more trait');
      const row = $('.dna-guess');
      assert(row.textContent.includes(g.name) && row.textContent.includes('km'), 'comparison row');
      const c = DNA.compare(g, target);
      assert(row.querySelector(`.cmp-${c.area > 0 ? 'up' : c.area < 0 ? 'down' : 'equal'}`), 'area arrow direction');
      await answer(target.name);
      expected += DNA.roundScore(2, true);
    } else if (i === 1) {
      await answer(target.name);
      expected += DNA.roundScore(1, true);
    } else {
      const wrongs = countries.filter((c) => c.id !== target.id).slice(10, 16);
      for (let k = 0; k < wrongs.length; k++) {
        if (k === 5) assert($('.dna-sil path'), 'silhouette revealed after 5 errors');
        await answer(wrongs[k].name);
      }
      assert($('.verdict.ko'), 'lost after 6 wrong');
    }
    await waitFor(() => $('.reveal-name'), 'reveal');
    eq($('.dna-name').textContent, target.name, 'name revealed on the card');
    eq(headerScore(), expected);
    await next();
  }
  await waitFor(() => $('.results'), 'results');
  eq(Number($('.big-num').textContent.replace(/\D/g, '')), expected);
});

test('map glitch placement mode: full free game', async () => {
  await open('#/map-glitch');
  click(await waitFor(() => $('[data-action="place"]'), 'placement button'));
  let total = 0;
  for (let i = 0; i < MG.PLACE_ROUNDS; i++) {
    const name = await waitFor(() => $('.pl-name')?.textContent, 'country name');
    const c = countries.find((x) => x.name === name);
    await waitFor(() => $('.pl-stage path.wm-land'), 'map');
    // click the centre of the main territory: inside for most countries
    clickMap(c.lat, c.lon, '.pl-stage .wm-svg');
    click(await waitFor(() => button('Valider'), 'validate'));
    await waitFor(() => $('.verdict'), 'verdict');
    total = headerScore();
    await next();
  }
  await waitFor(() => $('.results'), 'results');
  eq(Number($('.big-num').textContent.replace(/\D/g, '')), total);
  assert(total > 600, `centres of countries should mostly score: ${total}`);
  eq(stored().games['mapglitch-place'].played, 1);
});

test('world map can be played with the keyboard', async () => {
  await open('#/terrain-id?play=free');
  const svg = await waitFor(() => $('.tr-map .wm-svg[tabindex="0"]'), 'focusable map');
  await waitFor(() => $('.tr-map path.wm-land'), 'map paths');
  svg.focus();
  const key = (k) => svg.dispatchEvent(new (win().KeyboardEvent)('keydown', { key: k, bubbles: true }));
  key('ArrowRight');
  key('ArrowUp');
  assert($('.wm-marker-cursor'), 'keyboard cursor drawn');
  assert(!button('Valider'), 'nothing picked yet');
  key('Enter');
  assert(button('Valider'), 'Enter places the answer');
  assert($('.tr-map .wm-marker-guess'), 'guess marker drawn');
  assert($('.muted.small').textContent.includes('Position choisie'), 'position announced');
});

test('terrain id: free game at a chosen level, satellite map', async () => {
  await open('#/terrain-id');
  click(await waitFor(() => $('.levels [data-level="4"]'), 'level picker'));
  eq($('.levels [data-level="4"]').getAttribute('aria-checked'), 'true');
  click($('[data-action="free"]'));
  await waitFor(() => $('.gf-mode')?.textContent.includes('Expert'), 'expert label');
  assert($('.stage-caption').textContent.includes('Expert'), 'round is expert');
  const map = await waitFor(() => $('.tr-map .wm.wm-sat'), 'satellite map');
  await waitFor(() => map.querySelector('.wm-sat-low image'), 'satellite tiles');
  click(map.querySelector('[data-style="plan"]'));
  assert(!map.classList.contains('wm-sat'), 'switched to plan');
  eq(map.querySelectorAll('.wm-sat-low image').length, 0, 'tiles removed in plan view');
  click(map.querySelector('[data-style="satellite"]'));
  assert(map.classList.contains('wm-sat'), 'back to satellite');
  // zooming in loads sharper tiles
  for (let i = 0; i < 4; i++) click(map.querySelector('[aria-label="Zoom avant"]'));
  await waitFor(() => map.querySelector('.wm-sat-high image'), 'detail tiles after zoom');
  const lvl = Number(map.querySelector('.wm-sat-high image').dataset.key.split('/')[0]);
  assert(lvl >= 2, `detail level ${lvl}`);
});

test('stats page reflects the games', async () => {
  await open('#/stats');
  await waitFor(() => $('.stat-block'), 'stats');
  const blocks = $$('.stat-block');
  eq(blocks.length, 4);
  assert(blocks[1].textContent.includes('Défi du'), 'terrain history listed');
});

test('no runtime errors', async () => {
  eq(errors, []);
});

run();
