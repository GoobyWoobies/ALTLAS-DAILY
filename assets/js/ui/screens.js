// Screens shared by the three games: intro, in-game header, results.
import { h, clear, icon, copyText } from './dom.js';
import { dailyStatus } from '../core/session.js';
import { utcDateKey, formatDateKey, msUntilNextDaily } from '../core/daily.js';
import { formatInt } from '../core/text.js';

export function formatCountdown(ms) {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/**
 * Intro of a game: what it is, the rules, and the two ways to play.
 * onStart('daily' | 'free')
 */
const LEVEL_KEY = (game) => `atlas-daily:level:${game}`;

/**
 * levels (optional): [{id, label}] offered for free play; onStart('free', levelId).
 */
export function renderIntro(root, { game, title, lede, rules, meta, onStart, extras = [], levels = null }) {
  let level = levels ? levels[0].id : null;
  if (levels) {
    try {
      const saved = localStorage.getItem(LEVEL_KEY(game));
      if (levels.some((l) => l.id === saved)) level = saved;
    } catch {
      /* preference only */
    }
  }
  const levelPicker = levels
    ? h('div', { class: 'levels', role: 'radiogroup', 'aria-label': 'Niveau de la partie libre' },
      levels.map((l) => h('button', {
        type: 'button', role: 'radio', 'data-level': l.id, 'aria-checked': String(l.id === level),
        onClick: () => {
          level = l.id;
          for (const x of levelPicker.children) x.setAttribute('aria-checked', String(x.dataset.level === level));
          try {
            localStorage.setItem(LEVEL_KEY(game), level);
          } catch {
            /* preference only */
          }
        },
      }, l.label)))
    : null;
  const today = utcDateKey();
  const st = dailyStatus(game, today);
  let dailyLabel = 'Jouer le défi du jour';
  let dailyNote = `Même défi pour tous les joueurs · ${formatDateKey(today)} (UTC)`;
  if (st.state === 'progress') {
    dailyLabel = 'Reprendre le défi du jour';
    dailyNote = `Partie en cours, manche ${st.round + 1}`;
  } else if (st.state === 'done') {
    dailyLabel = 'Voir le résultat du jour';
    dailyNote = `Terminé · ${formatInt(st.score)} / ${formatInt(st.max)} · prochain défi dans ${formatCountdown(msUntilNextDaily())}`;
  }
  clear(root).append(
    h('section', { class: 'intro' },
      h('p', { class: 'kicker' }, 'ATLAS//DAILY'),
      h('h1', { class: 'intro-title' }, title),
      h('p', { class: 'lede' }, lede),
      h('div', { class: 'intro-grid' },
        h('div', { class: 'intro-rules' },
          h('h2', { class: 'label' }, 'Règles'),
          h('ol', { class: 'rules' }, rules.map((r) => h('li', null, r)))),
        h('div', { class: 'intro-play' },
          h('h2', { class: 'label' }, 'Jouer'),
          h('p', { class: 'meta' }, meta),
          h('div', { class: 'play-option' },
            h('button', { class: 'btn btn-primary btn-wide', type: 'button', 'data-action': 'daily', onClick: () => onStart('daily') },
              dailyLabel, icon('arrow')),
            h('p', { class: 'note' }, dailyNote)),
          h('div', { class: 'play-option' },
            levelPicker,
            h('button', { class: 'btn btn-wide', type: 'button', 'data-action': 'free', onClick: () => onStart('free', level) },
              'Partie libre', icon('arrow')),
            h('p', { class: 'note' }, levels ? 'Sélection aléatoire au niveau choisi, rejouable à volonté.' : 'Sélection aléatoire, rejouable à volonté.')),
          extras.map((x) => h('div', { class: 'play-option' },
            h('button', { class: 'btn btn-wide', type: 'button', 'data-action': x.id, onClick: x.onClick }, x.label, icon('arrow')),
            h('p', { class: 'note' }, x.note)))))),
  );
}

/** Header of a game in progress. Returns updaters and the body container. */
export function createFrame(root, { title, session }) {
  const progress = h('span', { class: 'gf-progress' });
  const score = h('span', { class: 'gf-score' });
  const steps = h('div', { class: 'gf-steps', 'aria-hidden': 'true' },
    session.rounds.map(() => h('span', { class: 'gf-step' })));
  const body = h('div', { class: 'gf-body' });
  clear(root).append(
    h('div', { class: 'gf' },
      h('div', { class: 'gf-bar' },
        h('div', { class: 'gf-title' },
          h('a', { class: 'gf-back', href: `#/${routeOf(session.game)}`, title: 'Retour aux règles', 'aria-label': 'Retour aux règles' }, icon('back')),
          h('span', { class: 'gf-name' }, title),
          h('span', { class: 'gf-mode' }, session.mode === 'daily' ? `Défi du ${formatDateKey(session.dateKey)}` : `Partie libre${session.variant ? ` · ${session.variant}` : ''}`)),
        h('div', { class: 'gf-status' }, progress, steps, score)),
      body),
  );
  function update() {
    const n = session.rounds.length;
    const i = Math.min(session.index + 1, n);
    progress.textContent = `Manche ${i}/${n}`;
    score.textContent = `${formatInt(session.score)} pts`;
    [...steps.children].forEach((el, k) => {
      const r = session.results[k];
      el.className = `gf-step${r ? (r.score > 0 ? ' ok' : ' ko') : ''}${k === session.index ? ' current' : ''}`;
    });
  }
  update();
  return { body, update };
}

export function routeOf(game) {
  return { mapglitch: 'map-glitch', 'mapglitch-place': 'map-glitch', terrain: 'terrain-id', dna: 'country-dna' }[game];
}

export function shareText(title, session) {
  const head = session.mode === 'daily'
    ? `ATLAS//DAILY · ${title} · ${formatDateKey(session.dateKey)}`
    : `ATLAS//DAILY · ${title} · partie libre`;
  return `${head}\n${session.results.map((r) => r.symbol).join(' ')}\n${session.score} / ${session.max}`;
}

/**
 * Final screen. rows: [{label, sub, points}]
 */
export function renderResults(root, { title, session, rows, legend, onReplay }) {
  const pct = session.max ? session.score / session.max : 0;
  const copyBtn = h('button', { class: 'btn', type: 'button' }, icon('copy'), 'Copier le résultat');
  const copied = h('span', { class: 'note', 'aria-live': 'polite' });
  copyBtn.addEventListener('click', async () => {
    copied.textContent = (await copyText(shareText(title, session))) ? 'Copié dans le presse-papiers.' : 'Copie impossible.';
  });
  clear(root).append(
    h('section', { class: 'results' },
      h('p', { class: 'kicker' }, session.mode === 'daily' ? `Défi du ${formatDateKey(session.dateKey)}` : 'Partie libre'),
      h('h1', { class: 'results-title' }, title, ' — résultat'),
      h('div', { class: 'results-score' },
        h('span', { class: 'big-num' }, formatInt(session.score)),
        h('span', { class: 'of' }, `/ ${formatInt(session.max)} points`),
        h('div', { class: 'meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(session.max), 'aria-valuenow': String(session.score) },
          h('span', { style: { width: `${Math.round(pct * 100)}%` } }))),
      h('table', { class: 'results-table' },
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Réponse'), h('th', null, 'Détail'), h('th', { class: 'num' }, 'Points'))),
        h('tbody', null, rows.map((r, i) =>
          h('tr', null,
            h('td', { class: 'muted' }, String(i + 1)),
            h('td', null, r.label),
            h('td', { class: 'muted' }, r.sub),
            h('td', { class: 'num' }, formatInt(r.points)))))),
      h('div', { class: 'share' },
        h('pre', { class: 'share-preview' }, shareText(title, session)),
        legend ? h('p', { class: 'note' }, legend) : null),
      h('div', { class: 'actions' },
        copyBtn,
        h('button', { class: 'btn btn-primary', type: 'button', onClick: onReplay }, 'Nouvelle partie libre', icon('arrow')),
        h('a', { class: 'btn btn-ghost', href: '#/stats' }, 'Statistiques'),
        copied),
      session.mode === 'daily'
        ? h('p', { class: 'note' }, `Prochain défi dans ${formatCountdown(msUntilNextDaily())} (minuit UTC).`)
        : null),
  );
}
