// Rules page: the shared principles, then each game in full (objective,
// steps, points, controls, modes). #/regles?jeu=<route> opens on one game.
import { h, icon } from '../ui/dom.js';
import { HELP, COMMON_RULES, helpSections } from '../ui/help.js';
import { dailyAction } from '../ui/screens.js';

const ORDER = ['mapglitch', 'terrain', 'dna'];

export function rulesPage(view, query) {
  const toc = h('nav', { class: 'rules-toc', 'aria-label': 'Aller à un jeu' },
    h('a', { href: '#/regles?jeu=principe', class: 'chip' }, 'Principe commun'),
    ORDER.map((id) => h('a', { href: `#/regles?jeu=${HELP[id].route}`, class: 'chip' }, HELP[id].name)));

  view.append(
    h('div', { class: 'page-wide rules-page' },
      h('header', { class: 'page-head' },
        h('p', { class: 'kicker' }, 'Aide'),
        h('h1', { class: 'page-title' }, 'Règles du jeu'),
        h('p', { class: 'lede' }, 'Trois jeux, une même logique : un défi commun chaque jour, des parties libres à volonté. Choisissez un jeu pour aller directement à ses règles.'),
        toc),

      h('section', { class: 'rules-section', id: 'regles-principe', 'aria-labelledby': 'h-principe' },
        h('h2', { class: 'rules-h2', id: 'h-principe' }, 'Principe commun'),
        h('div', { class: 'common-grid' },
          COMMON_RULES.map(([title, text]) => h('div', { class: 'info-card' }, h('h3', null, title), h('p', null, text))))),

      ORDER.map((id) => {
        const help = HELP[id];
        const daily = dailyAction(id);
        return h('section', { class: 'rules-section rules-game', id: `regles-${help.route}`, 'aria-labelledby': `h-${help.route}` },
          h('div', { class: 'rules-game-head' },
            h('div', null,
              h('h2', { class: 'rules-h2', id: `h-${help.route}` }, help.name),
              h('p', { class: 'lede' }, help.tagline),
              h('p', { class: 'intro-format' }, help.format)),
            h('div', { class: 'actions' },
              h('a', { class: 'btn btn-primary', href: `#/${help.route}?play=daily` }, daily.label, icon('arrow')),
              h('a', { class: 'btn btn-secondary', href: `#/${help.route}` }, 'Tous les modes'))),
          h('div', { class: 'rules-body' }, helpSections(help)));
      })));

  const target = query.get('jeu');
  if (target) {
    const el = view.querySelector(`#regles-${CSS.escape(target)}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }
}
