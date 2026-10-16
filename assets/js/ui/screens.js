// Screens shared by the three games: intro, in-game header, results.
import { h, clear, icon, copyText } from './dom.js';
import { dailyStatus } from '../core/session.js';
import { utcDateKey, formatDateKey, msUntilNextDaily } from '../core/daily.js';
import { formatInt } from '../core/text.js';
import { HELP, helpSections } from './help.js';

export function formatCountdown(ms) {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

const LEVEL_KEY = (game) => `atlas-daily:level:${game}`;

/** Label and note of the daily button, from the state of today's challenge. */
export function dailyAction(game, today = utcDateKey()) {
  const st = dailyStatus(game, today);
  if (st.state === 'progress') return { st, label: 'Reprendre le défi du jour', note: `Partie en cours, manche ${st.round + 1}. Votre progression est sauvegardée.` };
  if (st.state === 'done') return { st, label: 'Voir le résultat du jour', note: `Terminé · ${formatInt(st.score)} / ${formatInt(st.max)} · prochain défi dans ${formatCountdown(msUntilNextDaily())}` };
  return { st, label: 'Jouer le défi du jour', note: `Édition du ${formatDateKey(today)} (UTC) · prochain défi dans ${formatCountdown(msUntilNextDaily())}` };
}

/**
 * Start screen of a game: choice of mode first, then a short version of the rules.
 * levels (optional): [{id, label}] offered for free play; onStart('free', levelId).
 * extras: further modes [{id, label, title, note, onClick}].
 */
export function renderIntro(root, { game, onStart, extras = [], levels = null }) {
  const help = HELP[game];
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
    ? h('div', { class: 'levels', role: 'radiogroup', 'aria-labelledby': `lv-${game}` },
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
  const daily = dailyAction(game);

  const card = (cls, title, desc, ...rest) => h('article', { class: `mode-card ${cls}` },
    h('h3', { class: 'mode-title' }, title),
    h('p', { class: 'mode-desc' }, desc),
    ...rest);

  clear(root).append(
    h('section', { class: 'intro' },
      h('div', { class: 'intro-head' },
        h('p', { class: 'kicker' }, h('a', { href: '#/' }, 'Jeux'), h('span', { 'aria-hidden': 'true' }, ' / '), help.name),
        h('h1', { class: 'intro-title' }, help.name),
        h('p', { class: 'lede' }, help.tagline),
        h('p', { class: 'intro-format' }, help.format)),
      h('div', { class: 'intro-grid' },
        h('section', { class: 'intro-play', 'aria-labelledby': `play-${game}` },
          h('h2', { class: 'section-title', id: `play-${game}` }, 'Choisir un mode'),
          h('div', { class: 'mode-cards' },
            card('mode-daily', 'Défi du jour', 'Le même défi pour tous, renouvelé chaque jour à minuit UTC.',
              h('button', { class: 'btn btn-primary btn-wide', type: 'button', 'data-action': 'daily', onClick: () => onStart('daily') },
                daily.label, icon('arrow')),
              h('p', { class: 'note' }, daily.note)),
            card('mode-free', 'Partie libre', levels ? 'Une sélection au hasard, au niveau de votre choix. Rejouable à volonté.' : 'Une sélection au hasard, rejouable à volonté.',
              levels ? h('p', { class: 'field-label', id: `lv-${game}` }, 'Niveau') : null,
              levelPicker,
              h('button', { class: 'btn btn-secondary btn-wide', type: 'button', 'data-action': 'free', onClick: () => onStart('free', level) },
                'Lancer une partie libre', icon('arrow'))),
            extras.map((x) => card('mode-extra', x.title, x.note,
              h('button', { class: 'btn btn-secondary btn-wide', type: 'button', 'data-action': x.id, onClick: x.onClick }, x.label, icon('arrow'))))),
          h('div', { class: 'intro-status', 'aria-live': 'polite' })),
        h('aside', { class: 'intro-rules', 'aria-labelledby': `rules-${game}` },
          h('h2', { class: 'section-title', id: `rules-${game}` }, 'Comment jouer'),
          helpSections(help, { brief: true }),
          h('a', { class: 'link link-strong', href: `#/regles?jeu=${help.route}` }, 'Règles complètes, points et commandes', icon('arrow', 14))))),
  );
}

/**
 * Run a game's start-up (data loading, first round) with a visible loading
 * state, an understandable error with a retry button, and no double start.
 */
export async function launch(root, run) {
  if (root.dataset.launching) return;
  root.dataset.launching = '1';
  const buttons = [...root.querySelectorAll('[data-action]')];
  buttons.forEach((b) => { b.disabled = true; });
  const slot = root.querySelector('.intro-status') || root;
  const status = h('p', { class: 'status-box', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Chargement de la partie…');
  slot.append(status);
  try {
    await run();
  } catch (err) {
    console.error(err);
    status.remove();
    buttons.forEach((b) => { b.disabled = false; });
    const box = h('div', { class: 'error-box', role: 'alert' },
      h('p', { class: 'error-title' }, 'La partie n\'a pas pu démarrer.'),
      h('p', null, 'Les données du jeu n\'ont pas pu être chargées. Vérifiez votre connexion, puis réessayez.'),
      h('p', { class: 'note mono' }, String(err?.message || err)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => { box.remove(); launch(root, run); } }, 'Réessayer'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => window.location.reload() }, 'Recharger la page')));
    (slot.isConnected ? slot : root).append(box);
  } finally {
    delete root.dataset.launching;
  }
}

/** The rules of a game in a modal window, so a player can read them without leaving the round. */
export function openHelp(game) {
  const help = HELP[game] || HELP[game.replace(/-place$/, '')];
  const close = h('button', { class: 'icon-btn dialog-close', type: 'button', 'aria-label': 'Fermer les règles' }, icon('cross'));
  const dlg = h('dialog', { class: 'help-dialog', 'aria-labelledby': 'help-dialog-title' },
    h('div', { class: 'dialog-head' },
      h('div', null,
        h('p', { class: 'kicker' }, 'Règles'),
        h('h2', { class: 'dialog-title', id: 'help-dialog-title' }, help.name)),
      close),
    h('div', { class: 'dialog-body' },
      helpSections(help),
      h('p', { class: 'note' }, 'Votre partie reste en place derrière cette fenêtre.')));
  close.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click on the backdrop
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
  close.focus();
  return dlg;
}

/** Header of a game in progress. Returns updaters and the body container. */
export function createFrame(root, { title, session }) {
  const progress = h('span', { class: 'gf-progress' });
  const score = h('span', { class: 'gf-score' });
  const steps = h('div', { class: 'gf-steps', 'aria-hidden': 'true' },
    session.rounds.map(() => h('span', { class: 'gf-step' })));
  const body = h('div', { class: 'gf-body' });
  const quit = h('a', {
    class: 'btn btn-ghost btn-sm gf-back', href: `#/${routeOf(session.game)}`,
    title: session.mode === 'daily' ? 'Quitter (le défi du jour est sauvegardé)' : 'Quitter la partie libre',
    onClick: (e) => {
      // free games are not saved: confirm before leaving one in progress
      if (session.mode !== 'daily' && !session.done && session.results.length
        && !window.confirm('Quitter la partie libre ? Elle ne sera pas sauvegardée.')) e.preventDefault();
    },
  }, icon('back'), 'Quitter');
  clear(root).append(
    h('div', { class: 'gf' },
      h('div', { class: 'gf-bar' },
        h('div', { class: 'gf-title' },
          quit,
          h('span', { class: 'gf-name' }, title),
          h('span', { class: 'gf-mode' }, session.mode === 'daily' ? `Défi du ${formatDateKey(session.dateKey)}` : `Partie libre${session.variant ? ` · ${session.variant}` : ''}`)),
        h('div', { class: 'gf-status' },
          progress, steps, score,
          h('button', { class: 'btn btn-ghost btn-sm gf-help', type: 'button', 'aria-haspopup': 'dialog', onClick: () => openHelp(session.game) }, 'Règles'))),
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
  const copyBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, icon('copy'), 'Copier le résultat');
  const copied = h('span', { class: 'note', 'aria-live': 'polite' });
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(shareText(title, session));
    copied.textContent = ok ? 'Copié dans le presse-papiers.' : 'Copie impossible : sélectionnez le texte ci-dessus.';
    if (ok) {
      copyBtn.classList.add('is-done');
      setTimeout(() => copyBtn.classList.remove('is-done'), 1600);
    }
  });
  clear(root).append(
    h('section', { class: 'results' },
      h('p', { class: 'kicker' }, session.mode === 'daily' ? `Défi du ${formatDateKey(session.dateKey)}` : 'Partie libre'),
      h('h1', { class: 'results-title' }, title, ' — résultat'),
      h('div', { class: 'results-score' },
        h('span', { class: 'big-num' }, formatInt(session.score)),
        h('span', { class: 'of' }, `/ ${formatInt(session.max)} points`),
        h('div', { class: 'meter', role: 'meter', 'aria-label': 'Score', 'aria-valuemin': '0', 'aria-valuemax': String(session.max), 'aria-valuenow': String(session.score) },
          h('span', { style: { width: `${Math.round(pct * 100)}%` } }))),
      h('div', { class: 'actions results-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: onReplay }, 'Rejouer une partie libre', icon('arrow')),
        copyBtn,
        h('a', { class: 'btn btn-ghost', href: '#/' }, 'Autres jeux'),
        h('a', { class: 'btn btn-ghost', href: '#/stats' }, 'Statistiques'),
        copied),
      session.mode === 'daily'
        ? h('p', { class: 'note' }, `Prochain défi dans ${formatCountdown(msUntilNextDaily())} (minuit UTC).`)
        : null,
      h('table', { class: 'results-table' },
        h('caption', { class: 'visually-hidden' }, 'Détail des manches'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'Réponse'), h('th', { scope: 'col' }, 'Détail'), h('th', { scope: 'col', class: 'num' }, 'Points'))),
        h('tbody', null, rows.map((r, i) =>
          h('tr', null,
            h('td', { class: 'muted' }, String(i + 1)),
            h('td', null, r.label),
            h('td', { class: 'muted' }, r.sub),
            h('td', { class: 'num' }, formatInt(r.points)))))),
      h('div', { class: 'share' },
        h('p', { class: 'label' }, 'Résultat à partager'),
        h('pre', { class: 'share-preview' }, shareText(title, session)),
        legend ? h('p', { class: 'note' }, legend) : null)),
  );
}
