// Country DNA — screen.
import { h, clear, icon, bearingArrow } from '../../ui/dom.js';
import { getCountries, getShapes } from '../../core/data.js';
import { createSession } from '../../core/session.js';
import { countryInput } from '../../ui/countryInput.js';
import { createSilhouette } from '../../ui/silhouette.js';
import { createWorldMap } from '../../ui/worldMap.js';
import { renderIntro, createFrame, renderResults } from '../../ui/screens.js';
import { formatInt, formatArea, capitalize } from '../../core/text.js';
import { prepareShape } from '../mapglitch/rules.js';
import {
  GAME_ID, ROUND_PLAN, MAX_ATTEMPTS, SCORES, DIFFICULTY_LABEL, INITIAL_TRAITS, REVEAL_ORDER,
  buildRounds, visibleTraits, roundScore, maxScore, compare, resultSymbol,
  hemisphereNS, hemisphereEW, hemisphereNote, latitudeZone, shapeLabel, formatPosition, areaBracket,
} from './rules.js';

const TITLE = 'Country DNA';

const TRAIT_LABEL = {
  area: 'Superficie',
  neighbors: 'Frontières terrestres',
  coast: 'Accès à la mer',
  hemisphere: 'Hémisphères',
  zone: 'Zone climatique',
  highPoint: 'Point culminant',
  continent: 'Continent',
  shape: 'Forme du territoire',
  silhouette: 'Silhouette',
  subregion: 'Sous-région',
  position: 'Position du centre',
};

/** autostart: 'daily' | 'free' (| 'place' for Map Glitch) from a #/route?play= link */
export function mount(root, autostart = null) {
  renderIntro(root, {
    game: GAME_ID,
    title: TITLE,
    lede: 'Une fiche d\'identité géographique, un nom masqué. Retrouvez le pays.',
    rules: [
      `La fiche affiche d'abord ${INITIAL_TRAITS.length} caractéristiques réelles : superficie, frontières, accès à la mer, hémisphères.`,
      `Vous avez ${MAX_ATTEMPTS} essais. Chaque erreur révèle une caractéristique supplémentaire, jusqu'à la silhouette.`,
      'Chaque proposition est comparée au pays mystère : distance et direction, superficie, nombre de voisins, altitude, continent.',
      `Points : ${SCORES.join(', ')} selon l'essai. Trois fiches par partie, de difficulté croissante.`,
    ],
    meta: `${ROUND_PLAN.length} fiches · ${formatInt(maxScore())} points maximum`,
    onStart: (mode) => play(root, mode),
  });
  if (autostart === 'daily' || autostart === 'free') play(root, autostart);
}

async function play(root, mode) {
  root.append(h('p', { class: 'loading' }, 'Chargement des données…'));
  const [countries, shapes] = await Promise.all([getCountries(), getShapes()]);
  const session = createSession(GAME_ID, mode, (seed) => buildRounds(countries.list, seed), maxScore());
  if (session.done) return showResults(root, session, countries);
  const frame = createFrame(root, { title: TITLE, session });
  playRound(root, frame, session, countries, shapes);
}

function traitValue(key, c, ctx, finished) {
  switch (key) {
    case 'area': {
      const { smaller, larger } = areaBracket(c, ctx.byId);
      let note = '';
      if (smaller && larger) note = `entre ${smaller.name} (${formatArea(smaller.area)}) et ${larger.name} (${formatArea(larger.area)})`;
      else if (larger) note = `plus petit que ${larger.name}`;
      else if (smaller) note = `plus grand que ${smaller.name}`;
      return [`${formatArea(c.area)} km²`, note];
    }
    case 'neighbors': {
      const n = c.borders.length;
      return [n === 0 ? 'Aucune' : `${n} pays voisin${n > 1 ? 's' : ''}`,
        finished && n ? c.borders.map((b) => ctx.byId.get(b).name).join(', ') : 'États souverains uniquement'];
    }
    case 'coast':
      return c.landlocked ? ['Non', 'pays enclavé'] : ['Oui', c.borders.length === 0 ? 'aucune frontière terrestre' : 'façade maritime'];
    case 'hemisphere':
      return [`${hemisphereNS(c)} · ${hemisphereEW(c)}`, hemisphereNote(c) || 'territoire principal'];
    case 'zone':
      return [latitudeZone(c.lat), 'd\'après la latitude du centre du territoire'];
    case 'highPoint':
      return [`${formatInt(c.highPoint.elev)} m`, finished ? capitalize(c.highPoint.name) : 'nom masqué'];
    case 'continent':
      return [c.continent, ''];
    case 'shape':
      return [shapeLabel(c), `rapport d'allongement ${c.elongation.toFixed(1).replace('.', ',')}`];
    case 'subregion':
      return [c.subregion, ''];
    case 'position':
      return [formatPosition(c.lat, c.lon), ''];
    default:
      return ['', ''];
  }
}

function playRound(root, frame, session, countries, shapes) {
  const round = session.rounds[session.index];
  const target = countries.byId.get(round.id);
  const state = session.pending || { guesses: [] };
  let finished = false;

  const card = h('article', { class: 'dna-card', 'aria-label': 'Fiche du pays mystère' });
  const attemptsEl = h('div', { class: 'attempts' });
  const guessesEl = h('ol', { class: 'dna-guesses' });
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const input = countryInput({
    index: countries.index,
    exclude: () => new Set(state.guesses),
    onSubmit: (id) => submit(id),
  });

  const panel = h('div', { class: 'dna-panel' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Quel est ce pays ?'),
      h('p', { class: 'muted' }, 'Les flèches comparent le pays mystère à votre proposition.')),
    attemptsEl,
    input.el,
    feedback,
    guessesEl);

  clear(frame.body).append(h('div', { class: 'game-layout dna-layout' }, card, panel));
  frame.update();
  render();
  input.focus();

  function render() {
    const wrong = state.guesses.length;
    const visible = new Set(visibleTraits(wrong, finished));
    const order = [...INITIAL_TRAITS, ...REVEAL_ORDER, ...(finished ? ['subregion', 'position'] : [])];
    clear(card).append(
      h('header', { class: 'dna-head' },
        h('p', { class: 'label' }, `Fiche n° ${session.index + (finished ? 0 : 1)} · ${DIFFICULTY_LABEL[round.tier]}`),
        h('h2', { class: 'dna-name' }, finished ? target.name : 'Pays mystère'),
        h('span', { class: 'difficulty', 'aria-label': `Difficulté ${DIFFICULTY_LABEL[round.tier]}` },
          [1, 2, 3].map((k) => h('span', { class: `dot${k <= round.tier ? ' on' : ''}` })))),
      h('dl', { class: 'dna-traits' }, order.map((key) => {
        const revealAt = REVEAL_ORDER.indexOf(key) + 1;
        if (!visible.has(key)) {
          return h('div', { class: 'trait locked' },
            h('dt', null, TRAIT_LABEL[key]),
            h('dd', null, h('span', { class: 'muted' }, `révélé après ${revealAt} erreur${revealAt > 1 ? 's' : ''}`)));
        }
        if (key === 'silhouette') {
          const sil = createSilhouette({ className: 'sil dna-sil', label: 'Silhouette du pays mystère' });
          sil.update(prepareShape(shapes[target.id]));
          return h('div', { class: 'trait trait-sil' }, h('dt', null, TRAIT_LABEL[key]), h('dd', null, sil.el));
        }
        const [value, note] = traitValue(key, target, countries, finished);
        return h('div', { class: 'trait' },
          h('dt', null, TRAIT_LABEL[key]),
          h('dd', null, h('span', { class: 'value' }, value), note ? h('span', { class: 'note' }, note) : null));
      })));

    const left = MAX_ATTEMPTS - wrong;
    clear(attemptsEl).append(
      h('span', { class: 'label' }, 'Essais'),
      ...Array.from({ length: MAX_ATTEMPTS }, (_, i) => h('span', { class: `pip${i < wrong ? ' used' : ''}` })),
      h('span', { class: 'muted' }, finished ? '' : `${left} restant${left > 1 ? 's' : ''} · ${SCORES[wrong] ?? 0} pts en jeu`));

    clear(guessesEl).append(...state.guesses.slice().reverse().map((id) => guessRow(compare(countries.byId.get(id), target), countries)));
  }

  function submit(id) {
    if (finished) return null;
    if (state.guesses.includes(id)) return 'Déjà proposé.';
    if (id === round.id) {
      resolve(true);
      return null;
    }
    state.guesses.push(id);
    if (state.guesses.length >= MAX_ATTEMPTS) {
      resolve(false);
      return null;
    }
    session.savePending({ guesses: state.guesses });
    const next = REVEAL_ORDER[state.guesses.length - 1];
    feedback.textContent = `Ce n'est pas ${countries.byId.get(id).name}.${next ? ` Nouvelle information : ${TRAIT_LABEL[next].toLowerCase()}.` : ''}`;
    render();
    return null;
  }

  function resolve(solved) {
    finished = true;
    const attempts = solved ? state.guesses.length + 1 : MAX_ATTEMPTS;
    const score = roundScore(attempts, solved);
    const result = { id: round.id, solved, attempts, score, tier: round.tier };
    result.symbol = resultSymbol(result);
    session.recordRound(result);
    if (session.done) session.finish();
    frame.update();
    input.setDisabled(true);
    render();

    const map = createWorldMap({ label: `Localisation : ${target.name}` });
    map.highlight([target.id]);
    if (target.area < 30000) map.setOverlays([{ kind: 'marker', lat: target.lat, lon: target.lon, style: 'ring' }]);
    map.focus([target.lonMin > target.lonMax ? -180 : target.lonMin, target.latMin,
      target.lonMin > target.lonMax ? 180 : target.lonMax, target.latMax], 40);

    const last = session.done;
    const next = h('button', { class: 'btn btn-primary', type: 'button' }, last ? 'Voir le résultat' : 'Fiche suivante', icon('arrow'));
    const onKey = (e) => {
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        if (next.isConnected) next.click();
        else document.removeEventListener('keydown', onKey);
      }
    };
    next.addEventListener('click', () => {
      document.removeEventListener('keydown', onKey);
      if (last) showResults(root, session, countries);
      else playRound(root, frame, session, countries, shapes);
    });
    setTimeout(() => document.addEventListener('keydown', onKey), 0);

    clear(feedback).append(
      h('div', { class: `verdict ${solved ? 'ok' : 'ko'}` }, icon(solved ? 'check' : 'cross'),
        solved ? `Trouvé en ${attempts} essai${attempts > 1 ? 's' : ''} · +${score} points` : 'Fiche non résolue · 0 point'),
      h('p', { class: 'reveal-name' }, target.name),
      h('div', { class: 'mini-map' }, map.el),
      next);
    next.focus({ preventScroll: true });
  }
}

function cmpIcon(v, label) {
  const name = v > 0 ? 'up' : v < 0 ? 'down' : 'equal';
  const text = v > 0 ? `${label} : plus élevé(e) pour le pays mystère` : v < 0 ? `${label} : plus faible pour le pays mystère` : `${label} : identique`;
  return h('span', { class: `cmp cmp-${name}`, title: text, 'aria-label': text }, icon(name, 14));
}

function guessRow(c, countries) {
  const g = countries.byId.get(c.id);
  return h('li', { class: 'dna-guess' },
    h('div', { class: 'dg-name' }, g.name, c.isNeighbor ? h('span', { class: 'tag' }, 'frontalier') : null),
    h('div', { class: 'dg-cells' },
      h('span', { class: 'dg-cell', title: `Le pays mystère est à ${formatInt(c.km)} km, direction ${c.directionLong}` },
        bearingArrow(c.bearing, 14), `${formatInt(c.km)} km ${c.direction}`),
      h('span', { class: 'dg-cell' }, 'Superf.', cmpIcon(c.area, 'Superficie')),
      h('span', { class: 'dg-cell' }, 'Voisins', cmpIcon(c.neighbors, 'Nombre de voisins')),
      h('span', { class: 'dg-cell' }, 'Alt.', cmpIcon(c.highPoint, 'Point culminant')),
      h('span', { class: `dg-cell ${c.sameContinent ? 'yes' : 'no'}`, title: c.sameContinent ? 'Même continent' : 'Autre continent' },
        'Cont.', icon(c.sameContinent ? 'check' : 'cross', 14))));
}

function showResults(root, session, countries) {
  renderResults(root, {
    title: TITLE,
    session,
    legend: 'n/6 = trouvé au n-ième essai, × = non trouvé.',
    rows: session.results.map((r) => ({
      label: countries.byId.get(r.id).name,
      sub: `${DIFFICULTY_LABEL[r.tier]} · ${r.solved ? `${r.attempts} essai${r.attempts > 1 ? 's' : ''}` : 'non trouvé'}`,
      points: r.score,
    })),
    onReplay: () => play(root, 'free'),
  });
}
