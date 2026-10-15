// Terrain ID — screen.
import { h, clear, icon } from '../../ui/dom.js';
import { getPlaces, terrainImageUrl } from '../../core/data.js';
import { createSession } from '../../core/session.js';
import { createWorldMap } from '../../ui/worldMap.js';
import { createZoomImage } from '../../ui/zoomImage.js';
import { renderIntro, createFrame, renderResults } from '../../ui/screens.js';
import { formatInt } from '../../core/text.js';
import {
  GAME_ID, ROUNDS, MAX_HINTS, HINT_PENALTY, MAX_POINTS, LEVELS, TIER_LABEL,
  buildRounds, levelPlan, scoreGuess, roundCap, maxScore, resultSymbol, bboxCenter,
} from './rules.js';

const TITLE = 'Terrain ID';

/** autostart: 'daily' | 'free' (| 'place' for Map Glitch) from a #/route?play= link */
export function mount(root, autostart = null, query = new URLSearchParams()) {
  renderIntro(root, {
    game: GAME_ID,
    title: TITLE,
    lede: 'Un relief sans nom ni frontière. Situez-le sur la carte du monde.',
    rules: [
      'Chaque manche montre un rendu du relief réel d\'une région : altitudes, côtes, lacs et fleuves, sans aucun nom ni frontière.',
      'Observez le terrain (zoom à la molette ou avec les boutons), puis cliquez sur la carte du monde à l\'endroit où il se trouve.',
      `Un clic dans la zone représentée rapporte ${MAX_POINTS} points ; au-delà, les points diminuent avec la distance.`,
      `Trois indices facultatifs par manche ; chacun retire ${Math.round(HINT_PENALTY * 100)} % du maximum de la manche.`,
      'Quatre niveaux : Facile, Moyen, Difficile, Expert. Le défi du jour les parcourt dans l\'ordre ; en partie libre, vous choisissez le niveau.',
    ],
    meta: `${ROUNDS} manches · ${formatInt(maxScore())} points maximum`,
    levels: LEVELS.map(({ id, label }) => ({ id, label })),
    onStart: (mode, level) => play(root, mode, level),
  });
  if (autostart === 'daily' || autostart === 'free') play(root, autostart, query.get('level') || 'mixte');
}

async function play(root, mode, level = 'mixte') {
  root.append(h('p', { class: 'loading' }, 'Chargement des données…'));
  const places = await getPlaces();
  const byId = new Map(places.map((p) => [p.id, p]));
  const plan = levelPlan(mode === 'daily' ? 'mixte' : level);
  const variant = mode === 'daily' ? null : (LEVELS.find((l) => l.id === level) || LEVELS[0]).label;
  const session = createSession(GAME_ID, mode, (seed) => buildRounds(places, seed, plan), maxScore(plan), { variant });
  if (session.done) return showResults(root, session, byId);
  const frame = createFrame(root, { title: TITLE, session });
  playRound(root, frame, session, byId);
}

function playRound(root, frame, session, byId) {
  const round = session.rounds[session.index];
  const place = byId.get(round.id);
  const state = session.pending || { hints: 0 };
  let guess = null;
  let finished = false;

  const viewer = createZoomImage({ src: terrainImageUrl(place.id), alt: 'Relief de la région mystère (sans nom ni frontière)' });
  const map = createWorldMap({
    satellite: true,
    label: 'Carte du monde : cliquez pour placer votre réponse',
    onPick: (p) => {
      if (finished) return;
      guess = p;
      map.setOverlays([{ kind: 'marker', lat: p.lat, lon: p.lon, style: 'guess' }]);
      validate.disabled = false;
      mapNote.textContent = `Position choisie : ${fmtLat(p.lat)}, ${fmtLon(p.lon)}`;
    },
  });

  const hintsEl = h('ol', { class: 'hint-list' });
  const hintBtn = h('button', { class: 'btn', type: 'button' });
  const capEl = h('span', { class: 'cap' });
  const mapNote = h('p', { class: 'muted small', 'aria-live': 'polite' }, 'Cliquez sur la carte pour placer votre réponse.');
  const validate = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Valider la position', icon('arrow'));
  const reveal = h('div', { class: 'reveal', 'aria-live': 'polite' });

  hintBtn.addEventListener('click', () => {
    if (finished || state.hints >= MAX_HINTS) return;
    state.hints += 1;
    session.savePending({ hints: state.hints });
    renderHints();
  });
  validate.addEventListener('click', () => guess && resolve());

  const stage = h('div', { class: 'stage tr-stage' },
    viewer.el,
    h('div', { class: 'stage-caption' },
      h('span', null, `Difficulté : ${TIER_LABEL[round.tier]}`),
      h('span', null, 'Nord en haut · projection de Mercator · relief exagéré verticalement')));

  const panel = h('div', { class: 'tr-panel' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Où se trouve ce relief ?'),
      h('p', { class: 'muted' }, 'Maximum pour cette manche : ', capEl)),
    h('div', { class: 'tr-map' }, map.el),
    mapNote,
    h('div', { class: 'tr-actions' }, validate, hintBtn),
    hintsEl,
    reveal);

  clear(frame.body).append(h('div', { class: 'game-layout tr-layout' }, stage, panel));
  frame.update();
  renderHints();

  function renderHints() {
    clear(hintsEl).append(...place.hints.slice(0, state.hints).map((t, i) =>
      h('li', { class: 'hint-item' }, h('span', { class: 'label' }, `Indice ${i + 1}`), h('span', null, t))));
    capEl.textContent = `${formatInt(roundCap(state.hints))} points`;
    if (state.hints >= MAX_HINTS || finished) {
      hintBtn.disabled = true;
      hintBtn.textContent = 'Plus d\'indice';
    } else {
      hintBtn.disabled = false;
      hintBtn.textContent = `Indice ${state.hints + 1}/${MAX_HINTS} (−${Math.round(HINT_PENALTY * 100)} %)`;
    }
  }

  function resolve() {
    finished = true;
    const res = scoreGuess(place, guess, state.hints);
    const result = { id: place.id, km: Math.round(res.km), inside: res.inside, hints: state.hints, score: res.score, tier: round.tier };
    result.symbol = resultSymbol(result);
    session.recordRound(result);
    if (session.done) session.finish();
    frame.update();
    map.setInteractive(false);
    validate.remove();
    renderHints();

    const center = bboxCenter(place.bbox);
    map.setOverlays([
      { kind: 'bbox', bbox: place.bbox },
      ...(res.inside ? [] : [{ kind: 'line', a: guess, b: center }]),
      { kind: 'marker', lat: guess.lat, lon: guess.lon, style: 'guess' },
    ]);
    const [w, so, e, n] = place.bbox;
    map.focus([Math.min(w, guess.lon), Math.min(so, guess.lat), Math.max(e, guess.lon), Math.max(n, guess.lat)], 20);

    const last = session.done;
    const next = h('button', { class: 'btn btn-primary', type: 'button' }, last ? 'Voir le résultat' : 'Manche suivante', icon('arrow'));
    const onKey = (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (next.isConnected) next.click();
        else document.removeEventListener('keydown', onKey);
      }
    };
    next.addEventListener('click', () => {
      document.removeEventListener('keydown', onKey);
      if (last) showResults(root, session, byId);
      else playRound(root, frame, session, byId);
    });
    setTimeout(() => document.addEventListener('keydown', onKey), 0);

    clear(reveal).append(
      h('div', { class: `verdict ${res.score >= 500 ? 'ok' : 'ko'}` },
        icon(res.score >= 500 ? 'check' : 'cross'),
        res.inside ? 'Dans la zone !' : `À ${formatInt(res.km)} km de la zone.`),
      h('p', { class: 'reveal-name' }, place.name),
      h('p', { class: 'muted' }, `${place.where} · +${formatInt(res.score)} points${state.hints ? ` (${state.hints} indice${state.hints > 1 ? 's' : ''})` : ''}`),
      h('p', { class: 'explain' }, place.explain),
      next);
    next.focus({ preventScroll: true });
  }
}

function fmtLat(lat) {
  return `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`;
}
function fmtLon(lon) {
  return `${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'O'}`;
}

function showResults(root, session, byId) {
  renderResults(root, {
    title: TITLE,
    session,
    legend: '◆ dans la zone · ● moins de 250 km · ◐ moins de 1 000 km · ○ plus loin.',
    rows: session.results.map((r) => ({
      label: byId.get(r.id).name,
      sub: `${r.inside ? 'dans la zone' : `${formatInt(r.km)} km`}${r.hints ? ` · ${r.hints} indice${r.hints > 1 ? 's' : ''}` : ''}`,
      points: r.score,
    })),
    onReplay: () => play(root, 'free', session.mode === 'free' ? (LEVELS.find((l) => l.label === session.variant) || LEVELS[0]).id : 'mixte'),
  });
}
