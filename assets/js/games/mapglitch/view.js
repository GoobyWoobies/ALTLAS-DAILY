// Map Glitch — screen.
import { h, clear, icon } from '../../ui/dom.js';
import { getCountries, getShapes } from '../../core/data.js';
import { createSession } from '../../core/session.js';
import { countryInput } from '../../ui/countryInput.js';
import { createSilhouette } from '../../ui/silhouette.js';
import { createWorldMap } from '../../ui/worldMap.js';
import { renderIntro, createFrame, renderResults, launch } from '../../ui/screens.js';
import { playPlacement } from './placement.js';
import {
  GAME_ID, MAX_ATTEMPTS, DIFFICULTY_LABEL, TRANSFORM_LABEL,
  buildRounds, roundScore, maxScore, intensityAfter, prepareShape, applyGlitch, resultSymbol,
} from './rules.js';

const TITLE = 'Map Glitch';
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** autostart: 'daily' | 'free' (| 'place' for Map Glitch) from a #/route?play= link */
export function mount(root, autostart = null) {
  const start = (mode) => launch(root, () => play(root, mode));
  const place = () => launch(root, () => playPlacement(root));
  renderIntro(root, {
    game: GAME_ID,
    onStart: start,
    extras: [{
      id: 'place',
      title: 'Mode placement',
      label: 'Lancer le mode placement',
      note: 'Mode complémentaire : un pays est nommé, placez-le sur une carte sans frontières.',
      onClick: place,
    }],
  });
  if (autostart === 'daily' || autostart === 'free') start(autostart);
  else if (autostart === 'place') place();
}

async function play(root, mode) {
  const [countries, shapes] = await Promise.all([getCountries(), getShapes()]);
  const session = createSession(GAME_ID, mode, (seed) => buildRounds(countries.list, seed), maxScore());
  if (session.done) return showResults(root, session, countries);
  const frame = createFrame(root, { title: TITLE, session });
  playRound(root, frame, session, countries, shapes);
}

function playRound(root, frame, session, countries, shapes) {
  const round = session.rounds[session.index];
  const target = countries.byId.get(round.id);
  const base = prepareShape(shapes[round.id]);
  const state = session.pending || { wrong: [] };
  let t = intensityAfter(state.wrong.length);
  let finished = false;

  const sil = createSilhouette({ className: 'sil mg-sil', label: 'Silhouette déformée du pays mystère' });
  sil.update(applyGlitch(base, round.glitch, t));

  const attemptsEl = h('div', { class: 'attempts', 'aria-label': 'Essais' });
  const hintsEl = h('div', { class: 'hints' });
  const guessesEl = h('ul', { class: 'guesses' });
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const panel = h('div', { class: 'mg-panel' });

  const input = countryInput({
    index: countries.index,
    exclude: () => new Set(state.wrong),
    onSubmit: (id) => submit(id),
  });
  const skipBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => resolve(false) }, 'Passer cette manche');

  const stage = h('div', { class: 'stage mg-stage' },
    sil.el,
    h('div', { class: 'stage-caption' },
      h('span', null, `Difficulté : ${DIFFICULTY_LABEL[round.difficulty]}`),
      h('span', null, `${round.glitch.length} transformation${round.glitch.length > 1 ? 's' : ''}`)));

  panel.append(
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Quel est ce pays ?'),
      h('p', { class: 'muted' }, 'Tapez le nom puis Entrée, ou choisissez dans la liste.')),
    attemptsEl,
    input.el,
    hintsEl,
    guessesEl,
    feedback,
    h('div', { class: 'panel-foot' }, skipBtn));

  clear(frame.body).append(h('div', { class: 'game-layout' }, stage, panel));
  frame.update();
  renderState();
  input.focus();

  function renderState() {
    clear(attemptsEl).append(
      h('span', { class: 'label' }, 'Essais'),
      ...Array.from({ length: MAX_ATTEMPTS }, (_, i) =>
        h('span', { class: `pip${i < state.wrong.length ? ' used' : ''}` })),
      h('span', { class: 'muted' }, finished ? ''
        : `${MAX_ATTEMPTS - state.wrong.length} restant${MAX_ATTEMPTS - state.wrong.length > 1 ? 's' : ''} · ${roundScore(round.difficulty, state.wrong.length + 1, true)} pts en jeu`));
    clear(hintsEl);
    if (state.wrong.length >= 1) hintsEl.append(hintRow('Continent', target.continent));
    if (state.wrong.length >= 2) hintsEl.append(hintRow('Sous-région', target.subregion));
    clear(guessesEl).append(...state.wrong.map((id) =>
      h('li', { class: 'guess ko' }, icon('cross'), countries.byId.get(id).name)));
  }

  function submit(id) {
    if (finished) return null;
    if (state.wrong.includes(id)) return 'Déjà proposé.';
    if (id === round.id) {
      resolve(true);
      return null;
    }
    state.wrong.push(id);
    if (state.wrong.length >= MAX_ATTEMPTS) {
      resolve(false);
      return null;
    }
    session.savePending({ wrong: state.wrong });
    feedback.textContent = `Non, ce n'est pas ${countries.byId.get(id).name}. La déformation est réduite.`;
    animateTo(intensityAfter(state.wrong.length));
    renderState();
    return null;
  }

  let animation = 0; // id of the running animation; a newer one cancels it

  function animateTo(target, done) {
    const from = t;
    const id = ++animation;
    if (reduceMotion()) {
      t = target;
      sil.update(applyGlitch(base, round.glitch, t));
      done?.();
      return;
    }
    const start = performance.now();
    const dur = 650;
    let ended = false;
    const finish = () => {
      if (ended || id !== animation) return;
      ended = true;
      t = target;
      sil.update(applyGlitch(base, round.glitch, t));
      done?.();
    };
    const step = (now) => {
      if (ended || id !== animation) return;
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - k) ** 3;
      t = from + (target - from) * e;
      sil.update(applyGlitch(base, round.glitch, t));
      if (k < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
    // animation frames are paused in background tabs: guarantee the final state
    setTimeout(finish, dur + 100);
  }

  function resolve(solved) {
    if (finished) return;
    finished = true;
    const attempts = solved ? state.wrong.length + 1 : MAX_ATTEMPTS;
    const score = roundScore(round.difficulty, attempts, solved);
    const result = { id: round.id, solved, attempts, score, difficulty: round.difficulty };
    result.symbol = resultSymbol(result);
    session.recordRound(result);
    if (session.done) session.finish();
    frame.update();
    input.setDisabled(true);
    skipBtn.remove();
    renderState();
    animateTo(0);
    stage.classList.add(solved ? 'is-correct' : 'is-wrong');

    const map = createWorldMap({ label: `Localisation : ${target.name}` });
    map.highlight([round.id]);
    map.setOverlays(target.area < 30000 ? [{ kind: 'marker', lat: target.lat, lon: target.lon, style: 'ring' }] : []);
    map.focus([target.lonMin > target.lonMax ? -180 : target.lonMin, target.latMin,
      target.lonMin > target.lonMax ? 180 : target.lonMax, target.latMax], 40);

    const last = session.done;
    const next = h('button', { class: 'btn btn-primary', type: 'button' },
      last ? 'Voir le résultat' : 'Manche suivante', icon('arrow'));
    next.addEventListener('click', () => {
      document.removeEventListener('keydown', onKey);
      if (last) {
        showResults(root, session, countries);
      } else {
        playRound(root, frame, session, countries, shapes);
      }
    });
    const onKey = (e) => {
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        if (next.isConnected) next.click();
        else document.removeEventListener('keydown', onKey);
      }
    };
    setTimeout(() => document.addEventListener('keydown', onKey), 0);

    clear(feedback).append(
      h('div', { class: `verdict ${solved ? 'ok' : 'ko'}` },
        icon(solved ? 'check' : 'cross'),
        solved ? `Bonne réponse${attempts > 1 ? ` au ${attempts}e essai` : ''}.` : 'Manche perdue.'),
      h('p', { class: 'reveal-name' }, target.name),
      h('p', { class: 'muted' }, `${target.subregion} · +${score} points`),
      h('p', { class: 'muted small' }, `Déformations : ${round.glitch.map((g) => TRANSFORM_LABEL[g.type]).join(', ')}.`),
      h('div', { class: 'mini-map' }, map.el),
      next);
    next.focus({ preventScroll: true });
  }
}

function hintRow(label, value) {
  return h('div', { class: 'hint' }, h('span', { class: 'label' }, label), h('span', null, value));
}

function showResults(root, session, countries) {
  renderResults(root, {
    title: TITLE,
    session,
    legend: 'Chiffre = essai de la bonne réponse, × = manche perdue.',
    rows: session.results.map((r) => ({
      label: countries.byId.get(r.id).name,
      sub: `${DIFFICULTY_LABEL[r.difficulty]} · ${r.solved ? `trouvé au ${r.attempts === 1 ? '1er' : `${r.attempts}e`} essai` : 'non trouvé'}`,
      points: r.score,
    })),
    onReplay: () => launch(root, () => play(root, 'free')),
  });
}
