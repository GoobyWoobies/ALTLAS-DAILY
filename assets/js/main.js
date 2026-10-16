// ATLAS//DAILY — entry point: hash router, home, statistics and sources pages.
import { h, s, clear, icon } from './ui/dom.js';
import * as mapGlitch from './games/mapglitch/view.js';
import * as terrain from './games/terrain/view.js';
import * as dna from './games/dna/view.js';
import { gameStats, resetAll } from './core/storage.js';
import { utcDateKey, formatDateKey, msUntilNextDaily } from './core/daily.js';
import { formatInt } from './core/text.js';
import { SITE, AUTHOR } from './core/site.js';
import { formatCountdown, dailyAction } from './ui/screens.js';
import { rulesPage } from './pages/rules.js';
import { legalNotice, privacy } from './pages/legal.js';

const GAMES = [
  {
    id: 'mapglitch', route: 'map-glitch', name: 'Map Glitch', module: mapGlitch,
    desc: 'Une silhouette de pays réelle, mais déformée. Retrouvez le pays d\'origine.',
    format: '10 manches · 3 essais par manche',
  },
  {
    id: 'terrain', route: 'terrain-id', name: 'Terrain ID', module: terrain,
    desc: 'Un relief sans nom ni frontière. Placez-le sur la carte du monde.',
    format: '5 manches · 1 position par manche',
  },
  {
    id: 'dna', route: 'country-dna', name: 'Country DNA', module: dna,
    desc: 'Une fiche géographique, un nom masqué. Identifiez le pays.',
    format: '3 fiches · 6 essais par fiche',
  },
];

const app = document.getElementById('app');

function brand() {
  return h('a', { class: 'brand', href: '#/', 'aria-label': `${SITE}, accueil` }, 'ATLAS', h('span', { class: 'brand-sep' }, '//'), 'DAILY');
}

function nav(active) {
  const link = (route, label, cls = '') => h('a', {
    href: `#/${route}`, class: `${cls}${active === route ? ' active' : ''}`.trim() || null, 'aria-current': active === route ? 'page' : null,
  }, label);
  return h('header', { class: 'site-header' },
    h('div', { class: 'wrap header-inner' },
      brand(),
      h('nav', { class: 'site-nav', 'aria-label': 'Navigation principale' },
        GAMES.map((g) => link(g.route, g.name)),
        h('span', { class: 'nav-sep', 'aria-hidden': 'true' }),
        link('regles', 'Règles', 'nav-secondary'),
        link('stats', 'Statistiques', 'nav-secondary'))));
}

function footer() {
  const year = new Date().getFullYear();
  const col = (title, ...links) => h('div', { class: 'footer-col' },
    h('h2', { class: 'footer-h' }, title),
    h('ul', null, links.map(([href, label]) => h('li', null, h('a', { href }, label)))));
  return h('footer', { class: 'site-footer' },
    h('div', { class: 'wrap' },
      h('div', { class: 'footer-grid' },
        h('div', { class: 'footer-about' },
          brand(),
          h('p', null, 'Jeux de géographie quotidiens. Un nouveau défi chaque jour à minuit UTC, sans compte.')),
        col('Jeux', ...GAMES.map((g) => [`#/${g.route}`, g.name])),
        col('Aide', ['#/regles', 'Règles du jeu'], ['#/stats', 'Statistiques'], ['#/sources', 'Sources et licences']),
        col('Informations légales', ['#/mentions-legales', 'Mentions légales'], ['#/confidentialite', 'Confidentialité'])),
      h('div', { class: 'footer-legal' },
        h('p', null, `© ${year} ${SITE} — Créé par ${AUTHOR}. Tous droits réservés sur les éléments originaux du site.`),
        h('p', null, 'Données cartographiques tierces sous leur propre licence (Natural Earth, mledoze/countries, Wikidata, Terrain Tiles) : ',
          h('a', { href: '#/sources' }, 'voir les sources'), '.'))));
}

// Line glyphs for the game list (drawn, not emoji).
const GLYPHS = {
  mapglitch: [
    ['M16 6 38 5 44 15 14 15Z', ''],
    ['M21 17 53 17 49 29 19 29Z', 'accent'],
    ['M15 31 42 31 35 43 22 41Z', ''],
  ],
  terrain: [
    ['M6 38C12 20 30 9 45 13C58 17 60 32 51 38C41 45 17 45 6 38Z', ''],
    ['M17 34C21 24 31 19 40 21C48 24 47 32 40 35C32 38 22 38 17 34Z', 'accent'],
    ['M27 30C29 26 35 25 37 28C38 31 33 33 27 30Z', ''],
  ],
  dna: [
    ['M10 5H54V43H10Z', ''],
    ['M17 14H37M17 22H47M17 30H31M17 37H41', ''],
    ['M44 30H48', 'accent'],
  ],
};

function glyph(id) {
  return s('svg', { class: 'game-glyph icon', viewBox: '0 0 64 48', 'aria-hidden': 'true' },
    GLYPHS[id].map(([d, cls]) => s('path', { d, class: cls || null })));
}

function home(view) {
  const today = utcDateKey();
  const actions = GAMES.map((g) => dailyAction(g.id, today));
  const done = actions.filter((a) => a.st.state === 'done').length;
  view.append(
    h('section', { class: 'home-hero' },
      h('div', null,
        h('p', { class: 'kicker' }, 'Jeux de géographie quotidiens'),
        h('h1', { class: 'home-title' }, 'Trois façons de lire le monde, un nouveau défi chaque jour.'),
        h('p', { class: 'lede' }, 'Silhouettes de pays déformées, reliefs sans nom, fiches d\'identité géographique. Données cartographiques réelles, sans compte.'),
        h('ul', { class: 'home-facts' },
          h('li', null, icon('check', 14), 'Un défi par jeu, le même pour tous'),
          h('li', null, icon('check', 14), 'Parties libres illimitées'),
          h('li', null, icon('check', 14), 'Scores gardés sur cet appareil'))),
      h('div', { class: 'home-coords', 'aria-label': 'Édition du jour' },
        h('div', null, 'Édition du ', h('strong', null, formatDateKey(today)), ' UTC'),
        h('div', null, 'Défis terminés : ', h('strong', null, `${done} / ${GAMES.length}`)),
        h('div', null, `Prochaine édition dans ${formatCountdown(msUntilNextDaily())}`))),
    h('h2', { class: 'section-title home-section' }, 'Choisir un jeu'),
    h('ul', { class: 'game-grid' }, GAMES.map((g, i) => {
      const a = actions[i];
      const status = a.st.state === 'done'
        ? h('span', { class: 'badge badge-ok' }, icon('check', 12), `Terminé · ${formatInt(a.st.score)} / ${formatInt(a.st.max)}`)
        : a.st.state === 'progress'
          ? h('span', { class: 'badge badge-progress' }, `En cours · manche ${a.st.round + 1}`)
          : h('span', { class: 'badge' }, 'Défi du jour disponible');
      return h('li', { class: 'game-card' },
        h('div', { class: 'game-card-head' },
          glyph(g.id),
          h('span', { class: 'game-num' }, String(i + 1).padStart(2, '0'))),
        h('h3', { class: 'game-name' }, h('a', { href: `#/${g.route}` }, g.name)),
        h('p', { class: 'game-desc' }, g.desc),
        h('p', { class: 'game-format' }, g.format),
        status,
        h('div', { class: 'game-actions' },
          h('a', { class: 'btn btn-primary btn-wide', href: `#/${g.route}?play=daily` }, a.label, icon('arrow')),
          h('a', { class: 'btn btn-secondary btn-wide', href: `#/${g.route}` }, 'Partie libre et règles')));
    })),
    h('p', { class: 'note home-note' }, 'Nouveau ? Commencez par les ', h('a', { href: '#/regles' }, 'règles du jeu'), '. Vos scores et vos séries restent sur cet appareil : ', h('a', { href: '#/stats' }, 'voir les statistiques'), '.'),
  );
}

function stats(view) {
  view.append(
    h('section', { class: 'page' },
      h('p', { class: 'kicker' }, 'Sur cet appareil'),
      h('h1', { class: 'page-title' }, 'Statistiques'),
      h('p', { class: 'lede' }, 'Les statistiques sont enregistrées localement dans votre navigateur. Il n\'y a ni compte ni classement en ligne.'),
      [...GAMES, { id: 'mapglitch-place', route: 'map-glitch', name: 'Map Glitch · placement' }].map((g) => {
        const st = gameStats(g.id);
        return h('section', { class: 'stat-block' },
          h('div', { class: 'stat-head' }, h('h2', null, g.name), h('a', { href: `#/${g.route}`, class: 'link' }, 'Jouer', icon('arrow', 14))),
          h('dl', { class: 'stat-grid' },
            statItem('Parties jouées', formatInt(st.played)),
            statItem('Meilleur score', formatInt(st.best)),
            statItem('Score moyen', st.played ? formatInt(st.average) : '—'),
            statItem('Réussite', st.played ? `${Math.round(st.accuracy * 100)} %` : '—'),
            statItem('Défis du jour', formatInt(st.dailyDone)),
            statItem('Série en cours', `${st.streak} j`),
            statItem('Meilleure série', `${st.bestStreak} j`)),
          st.history.length
            ? h('table', { class: 'history' },
              h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Mode'), h('th', null, 'Détail'), h('th', { class: 'num' }, 'Score'))),
              h('tbody', null, st.history.slice(0, 8).map((r) => h('tr', null,
                h('td', null, formatDateKey(r.at.slice(0, 10))),
                h('td', null, r.mode === 'daily' ? `Défi du ${formatDateKey(r.dateKey)}` : `Libre${r.variant ? ` · ${r.variant}` : ''}`),
                h('td', { class: 'muted mono' }, (r.detail || []).join(' ')),
                h('td', { class: 'num' }, `${formatInt(r.score)} / ${formatInt(r.max)}`)))))
            : h('p', { class: 'muted' }, 'Aucune partie terminée pour l\'instant.'));
      }),
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            if (window.confirm('Effacer toutes les statistiques, les défis et les préférences enregistrés sur cet appareil ?')) {
              resetAll();
              render();
            }
          },
        }, 'Effacer les données locales'))));
}

function statItem(label, value) {
  return h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value));
}

function sources(view) {
  view.append(
    h('section', { class: 'page prose' },
      h('p', { class: 'kicker' }, 'À propos'),
      h('h1', { class: 'page-title' }, 'Sources et licences'),
      h('p', null, 'Toutes les données sont embarquées dans le site. Une fois la page chargée, le jeu ne contacte aucun service externe.'),
      h('h2', null, 'Pays : contours, carte du monde, silhouettes'),
      h('p', null, h('a', { href: 'https://www.naturalearthdata.com/', rel: 'noopener' }, 'Natural Earth'), ' — limites administratives 1:10m (v5), domaine public. Les contours sont simplifiés. Les entités séparées par Natural Earth mais rattachées de jure à un État membre de l\'ONU (Somaliland, Chypre du Nord, Kosovo, Baïkonour) sont fusionnées avec cet État.'),
      h('h2', null, 'Pays : superficie, frontières, enclavement, noms'),
      h('p', null, h('a', { href: 'https://github.com/mledoze/countries', rel: 'noopener' }, 'mledoze/countries'), ' — Open Database License (ODbL 1.0). Superficies en km² (territoire principal, eaux intérieures comprises). Frontières : uniquement les voisins figurant parmi les 194 États retenus (193 membres de l\'ONU + Vatican), frontière déclarée dans les deux sens.'),
      h('h2', null, 'Points culminants'),
      h('p', null, h('a', { href: 'https://www.wikidata.org/', rel: 'noopener' }, 'Wikidata'), ' (CC0), extraction unique. Quelques valeurs corrigées pour suivre la convention « territoire principal » (par exemple l\'Australie sans l\'île Heard, les Pays-Bas sans les Antilles).'),
      h('h2', null, 'Relief (Terrain ID)'),
      h('p', null, 'Altitudes : ', h('a', { href: 'https://registry.opendata.aws/terrain-tiles/', rel: 'noopener' }, 'Terrain Tiles (AWS Open Data)'), ', issues notamment de SRTM (NASA), GMTED2010 (USGS), ETOPO1 (NOAA), EU-DEM (Copernicus) et des modèles nationaux. Côtes, lacs et fleuves : Natural Earth. Rendus ombrés pré-calculés une fois et hébergés avec le site.'),
      h('h2', null, 'Fond de relief (carte de Terrain ID)'),
      h('p', null, 'Mêmes sources que les rendus de relief : ', h('a', { href: 'https://registry.opendata.aws/terrain-tiles/', rel: 'noopener' }, 'Terrain Tiles (AWS Open Data)'), ' pour les altitudes, Natural Earth pour les côtes et les lacs. Carte ombrée reprojetée en Equal Earth et découpée en tuiles une fois pour toutes, hébergées avec le site.'),
      h('h2', null, 'Conventions de jeu'),
      h('ul', null,
        h('li', null, 'Les caractéristiques de position (hémisphères, latitude, forme) se rapportent au territoire principal : la France métropolitaine, par exemple, sans les territoires d\'outre-mer.'),
        h('li', null, 'La « zone climatique » de Country DNA est une zone théorique déduite de la latitude du centre du pays, pas une classification climatique observée.'),
        h('li', null, 'Les distances sont calculées sur la sphère (formule de haversine). Celles de Country DNA relient les centres des territoires principaux.'),
        h('li', null, 'Le défi du jour change à minuit UTC. Le contenu et l\'ordre des manches sont déterminés par la date.'))));
}

function notFound(view) {
  view.append(
    h('section', { class: 'page' },
      h('p', { class: 'kicker' }, 'Erreur 404'),
      h('h1', { class: 'page-title' }, 'Cette page n\'existe pas'),
      h('p', { class: 'lede' }, 'Le lien suivi est peut-être ancien ou incomplet.'),
      h('div', { class: 'actions' },
        h('a', { class: 'btn btn-primary', href: '#/' }, 'Retour à l\'accueil', icon('arrow')),
        h('a', { class: 'btn btn-secondary', href: '#/regles' }, 'Règles du jeu'))));
}

const ROUTES = {
  '': { render: home },
  regles: { render: rulesPage, title: 'Règles du jeu' },
  stats: { render: stats, title: 'Statistiques' },
  sources: { render: sources, title: 'Sources et licences' },
  'mentions-legales': { render: legalNotice, title: 'Mentions légales' },
  confidentialite: { render: privacy, title: 'Confidentialité' },
  ...Object.fromEntries(GAMES.map((g) => [g.route, { render: (v, q) => g.module.mount(v, q.get('play'), q), title: g.name }])),
};

function render() {
  const [key, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const route = ROUTES[key] || { render: notFound, title: 'Page introuvable' };
  const view = h('main', { class: 'wrap view', id: 'main', tabindex: '-1' });
  // leaving a screen must not leave the page locked behind an enlarged map or an open dialog
  document.documentElement.classList.remove('wm-lock');
  document.querySelectorAll('dialog.help-dialog').forEach((d) => d.remove());
  clear(app).append(nav(key), view, footer());
  document.title = route.title ? `${route.title} — ${SITE}` : `${SITE} — jeux de géographie quotidiens`;
  window.scrollTo(0, 0);
  try {
    route.render(view, new URLSearchParams(query));
  } catch (err) {
    showError(err);
    throw err;
  }
}

// Last-resort error display: one message per distinct error, with a way out,
// instead of a new line for every failed promise.
const shown = new Set();
function showError(err) {
  const msg = String(err?.message || err || 'erreur inconnue');
  const view = document.getElementById('main');
  if (!view || shown.has(msg)) return;
  shown.add(msg);
  view.prepend(h('div', { class: 'error-box', role: 'alert' },
    h('p', { class: 'error-title' }, 'Une erreur est survenue.'),
    h('p', null, 'Une partie du site n\'a pas pu s\'afficher. Rechargez la page ; si le problème continue, vérifiez votre connexion.'),
    h('p', { class: 'note mono' }, msg),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => window.location.reload() }, 'Recharger la page'))));
}

window.addEventListener('hashchange', () => {
  shown.clear();
  render();
});
window.addEventListener('unhandledrejection', (e) => showError(e.reason));
render();
