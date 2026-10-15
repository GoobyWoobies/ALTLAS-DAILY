// Map Glitch — complementary "placement" mode: find a named country on a
// world map drawn without borders.
import { h, clear, icon } from '../../ui/dom.js';
import { getCountries, getShapes, getWorld } from '../../core/data.js';
import { createSession } from '../../core/session.js';
import { createWorldMap } from '../../ui/worldMap.js';
import { createSilhouette } from '../../ui/silhouette.js';
import { createFrame, renderResults } from '../../ui/screens.js';
import { distanceToPolygonsKm } from '../../core/geo.js';
import { formatInt } from '../../core/text.js';
import {
  PLACE_GAME_ID, PLACE_ROUNDS, PLACE_MAX, DIFFICULTY_LABEL,
  buildPlacementRounds, placementScore, placementSymbol, prepareShape,
} from './rules.js';

const TITLE = 'Map Glitch · placement';

export async function playPlacement(root) {
  root.append(h('p', { class: 'loading' }, 'Chargement des données…'));
  const [countries, shapes, world] = await Promise.all([getCountries(), getShapes(), getWorld()]);
  const polys = new Map();
  for (const f of world) if (f.id) polys.set(f.id, [...(polys.get(f.id) || []), ...f.p]);
  const session = createSession(PLACE_GAME_ID, 'free', (seed) => buildPlacementRounds(countries.list, seed), PLACE_ROUNDS * PLACE_MAX);
  const frame = createFrame(root, { title: TITLE, session });
  const ctx = { root, frame, session, countries, shapes, polys };
  round(ctx);
}

function round(ctx) {
  const { frame, session, countries, shapes, polys } = ctx;
  const r = session.rounds[session.index];
  const target = countries.byId.get(r.id);
  let guess = null;

  const map = createWorldMap({
    borders: false,
    label: 'Carte du monde sans frontières : cliquez sur le pays demandé',
    onPick: (p) => {
      guess = p;
      map.setOverlays([{ kind: 'marker', lat: p.lat, lon: p.lon, style: 'guess' }]);
      validate.disabled = false;
    },
  });
  const sil = createSilhouette({ className: 'sil pl-sil', label: `Silhouette : ${target.name}` });
  sil.update(prepareShape(shapes[r.id]));
  const validate = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Valider la position', icon('arrow'));
  const reveal = h('div', { class: 'reveal', 'aria-live': 'polite' });

  clear(frame.body).append(
    h('div', { class: 'game-layout pl-layout' },
      h('div', { class: 'stage pl-stage' }, map.el,
        h('div', { class: 'stage-caption' }, h('span', null, 'Carte sans frontières · molette ou boutons pour zoomer'), h('span', null, `Difficulté : ${DIFFICULTY_LABEL[r.tier]}`))),
      h('div', { class: 'pl-panel' },
        h('p', { class: 'label' }, 'Placez sur la carte'),
        h('h2', { class: 'pl-name' }, target.name),
        sil.el,
        h('p', { class: 'muted small' }, `${PLACE_MAX} points dans le pays, puis moins à mesure que l'on s'en éloigne.`),
        validate,
        reveal)));
  frame.update();

  validate.addEventListener('click', () => {
    if (!guess) return;
    validate.remove();
    map.setInteractive(false);
    const km = distanceToPolygonsKm(guess.lat, guess.lon, polys.get(r.id));
    const score = placementScore(km);
    const res = { id: r.id, km: Math.round(km), score, tier: r.tier };
    res.symbol = placementSymbol(res);
    session.recordRound(res);
    if (session.done) session.finish();
    frame.update();
    map.highlight([r.id]);
    map.setOverlays([
      ...(km > 0 ? [{ kind: 'line', a: guess, b: { lat: target.lat, lon: target.lon } }] : []),
      { kind: 'marker', lat: guess.lat, lon: guess.lon, style: 'guess' },
      ...(target.area < 30000 ? [{ kind: 'marker', lat: target.lat, lon: target.lon, style: 'ring' }] : []),
    ]);
    const last = session.done;
    const next = h('button', { class: 'btn btn-primary', type: 'button' }, last ? 'Voir le résultat' : 'Manche suivante', icon('arrow'));
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (next.isConnected) next.click();
      else document.removeEventListener('keydown', onKey);
    };
    next.addEventListener('click', () => {
      document.removeEventListener('keydown', onKey);
      if (last) showResults(ctx);
      else round(ctx);
    });
    setTimeout(() => document.addEventListener('keydown', onKey), 0);
    clear(reveal).append(
      h('div', { class: `verdict ${km === 0 ? 'ok' : 'ko'}` }, icon(km === 0 ? 'check' : 'cross'),
        km === 0 ? 'Dans le pays !' : `À ${formatInt(km)} km de la frontière.`),
      h('p', { class: 'muted' }, `${target.subregion} · +${score} points`),
      next);
    next.focus({ preventScroll: true });
  });
}

function showResults(ctx) {
  const { root, session, countries } = ctx;
  renderResults(root, {
    title: TITLE,
    session,
    legend: '◆ dans le pays · ● moins de 300 km · ◐ moins de 1 000 km · ○ plus loin.',
    rows: session.results.map((r) => ({
      label: countries.byId.get(r.id).name,
      sub: r.km === 0 ? 'dans le pays' : `${formatInt(r.km)} km`,
      points: r.score,
    })),
    onReplay: () => playPlacement(root),
  });
}
