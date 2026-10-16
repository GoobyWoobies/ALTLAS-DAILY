// Rules of the three games, written once and shown in two places: the short
// version on each game's start screen, the full version on the rules page.
// Figures come from the rules modules, so the text follows any balance change.
import { h } from './dom.js';
import { formatInt } from '../core/text.js';
import * as MG from '../games/mapglitch/rules.js';
import * as TR from '../games/terrain/rules.js';
import * as DNA from '../games/dna/rules.js';

const pct = (x) => `${Math.round(x * 100)} %`;

/**
 * Per game:
 *  goal      one sentence: what the player must do
 *  format    rounds and maximum score
 *  steps     how a round goes, in order
 *  scoring   [situation, points]
 *  controls  [action, how]
 *  modes     [mode, description]
 */
export const HELP = {
  mapglitch: {
    id: 'mapglitch',
    route: 'map-glitch',
    name: 'Map Glitch',
    tagline: 'Une silhouette de pays, réelle mais déformée. Retrouvez le pays d\'origine.',
    goal: 'Reconnaître un pays à partir de son contour, déformé par une à trois transformations.',
    format: `${MG.ROUND_PLAN.length} manches · ${MG.MAX_ATTEMPTS} essais par manche · ${formatInt(MG.maxScore())} points maximum`,
    steps: [
      'Observez la silhouette : le contour réel d\'un pays, déformé (rotation, miroir, étirement, ondulation, torsion…).',
      'Tapez le nom du pays et choisissez-le dans la liste proposée, puis validez avec Entrée.',
      `Vous avez ${MG.MAX_ATTEMPTS} essais. Chaque erreur répare une partie de la déformation et révèle un indice de localisation.`,
      'La difficulté augmente au fil des manches : pays moins connus, déformations plus fortes.',
    ],
    scoring: [
      ['Pays facile / moyen / difficile', `${MG.BASE_POINTS[1]} / ${MG.BASE_POINTS[2]} / ${MG.BASE_POINTS[3]} points de base`],
      ['Trouvé au 1er essai', pct(MG.ATTEMPT_FACTOR[0])],
      ['Trouvé au 2e essai', pct(MG.ATTEMPT_FACTOR[1])],
      ['Trouvé au 3e essai', pct(MG.ATTEMPT_FACTOR[2])],
      ['Manche passée ou ratée', '0 point'],
    ],
    controls: [
      ['Répondre', 'saisir un nom, flèches haut / bas pour parcourir la liste, Entrée pour valider'],
      ['Passer', 'bouton « Passer cette manche » (0 point)'],
    ],
    modes: [
      ['Défi du jour', 'les mêmes 10 pays pour tous, renouvelés à minuit UTC. Une seule partie par jour, reprise possible.'],
      ['Partie libre', 'pays tirés au hasard, rejouable à volonté.'],
      ['Mode placement', `mode complémentaire : un pays est nommé, placez-le sur une carte sans frontières (${MG.PLACE_ROUNDS} manches, ${MG.PLACE_MAX} points chacune, moins à mesure que l'on s'en éloigne).`],
    ],
  },
  terrain: {
    id: 'terrain',
    route: 'terrain-id',
    name: 'Terrain ID',
    tagline: 'Un relief sans nom ni frontière. Situez-le sur la carte du monde.',
    goal: 'Retrouver où se trouve la région dont le relief est affiché, en plaçant un repère sur la carte du monde.',
    format: `${TR.ROUNDS} manches · 1 position par manche · ${formatInt(TR.maxScore())} points maximum`,
    steps: [
      'Observez le rendu du relief réel d\'une région : altitudes, côtes, lacs et fleuves, sans aucun nom ni frontière. Le nord est en haut.',
      'Cliquez sur la carte du monde à l\'endroit où vous pensez que se trouve la région. Vous pouvez déplacer votre repère autant de fois que vous le voulez.',
      'Validez la position. La zone réelle apparaît sur la carte, avec la distance, le nom du lieu et une explication.',
      `Besoin d'aide ? Jusqu'à ${TR.MAX_HINTS} indices par manche, au prix de quelques points.`,
    ],
    scoring: [
      ['Repère dans la zone représentée', `${formatInt(TR.MAX_POINTS)} points`],
      ['Repère hors de la zone', 'les points diminuent avec la distance (environ la moitié tous les 520 km)'],
      ['Chaque indice utilisé', `−${pct(TR.HINT_PENALTY)} du maximum de la manche`],
    ],
    controls: [
      ['Zoomer', 'molette, pincement ou boutons + et −, sur l\'image comme sur la carte'],
      ['Se déplacer', 'glisser avec la souris ou le doigt'],
      ['Agrandir la carte', 'bouton plein écran en haut à droite de la carte ; Échap pour revenir'],
      ['Fond de carte', 'Relief (par défaut) ou Plan, avec les frontières'],
      ['Clavier', 'flèches pour déplacer le curseur, Entrée pour placer, + et − pour zoomer'],
    ],
    modes: [
      ['Défi du jour', `les mêmes ${TR.ROUNDS} lieux pour tous, de Facile à Expert (${TR.ROUND_PLAN.map((t) => TR.TIER_LABEL[t]).join(', ')}).`],
      ['Partie libre', `lieux tirés au hasard, au niveau choisi : ${TR.LEVELS.map((l) => l.label).join(', ')}.`],
    ],
  },
  dna: {
    id: 'dna',
    route: 'country-dna',
    name: 'Country DNA',
    tagline: 'Une fiche d\'identité géographique, un nom masqué. Retrouvez le pays.',
    goal: 'Identifier un pays à partir de ses caractéristiques géographiques réelles.',
    format: `${DNA.ROUND_PLAN.length} fiches · ${DNA.MAX_ATTEMPTS} essais par fiche · ${formatInt(DNA.maxScore())} points maximum`,
    steps: [
      `La fiche affiche d'abord ${DNA.INITIAL_TRAITS.length} caractéristiques : superficie, frontières terrestres, accès à la mer, hémisphères.`,
      'Proposez un pays. Votre proposition est comparée au pays mystère : distance et direction, superficie, nombre de voisins, altitude, continent.',
      'Chaque erreur révèle une caractéristique supplémentaire, jusqu\'à la silhouette du pays.',
      'Trois fiches par partie, de difficulté croissante.',
    ],
    scoring: DNA.SCORES.map((sc, i) => [`Trouvé au ${i + 1}${i ? 'e' : 'er'} essai`, `${formatInt(sc)} points`])
      .concat([['Fiche non trouvée', '0 point']]),
    controls: [
      ['Répondre', 'saisir un nom, flèches haut / bas pour parcourir la liste, Entrée pour valider'],
      ['Direction', 'la flèche pointe de votre proposition vers le pays mystère, avec la distance en km'],
      ['Comparaisons', 'flèche vers le haut : valeur plus élevée pour le pays mystère (superficie, voisins, altitude) ; vers le bas : plus faible ; signe égal : identique'],
    ],
    modes: [
      ['Défi du jour', 'les mêmes 3 fiches pour tous, renouvelées à minuit UTC.'],
      ['Partie libre', 'fiches tirées au hasard, rejouable à volonté.'],
    ],
  },
};

function pairs(rows, cls) {
  return h('dl', { class: `help-pairs ${cls || ''}` },
    rows.map(([k, v]) => h('div', { class: 'help-pair' }, h('dt', null, k), h('dd', null, v))));
}

/**
 * The rules of one game as blocks: objective, steps, points, and (full version)
 * controls and modes. brief: start-screen version.
 */
export function helpSections(help, { brief = false } = {}) {
  const sub = (title, ...body) => h('section', { class: 'help-block' }, h('h3', { class: 'help-h' }, title), ...body);
  return [
    h('div', { class: 'help-goal' }, h('p', { class: 'label' }, 'Objectif'), h('p', null, help.goal)),
    sub('Déroulement d\'une manche', h('ol', { class: 'steps' }, help.steps.map((t) => h('li', null, t)))),
    sub('Points', pairs(help.scoring, 'help-points')),
    brief ? null : sub('Commandes', pairs(help.controls)),
    brief ? null : sub('Modes de jeu', pairs(help.modes)),
  ];
}

/** Rules shared by every game. */
export const COMMON_RULES = [
  ['Défi du jour', 'Un défi par jeu, identique pour tous les joueurs, renouvelé chaque jour à minuit UTC. Il se joue une fois ; une partie interrompue reprend où vous l\'aviez laissée.'],
  ['Partie libre', 'Une sélection aléatoire, rejouable sans limite. Elle compte dans vos statistiques mais n\'est pas sauvegardée si vous quittez en cours de route.'],
  ['Scores', 'Vos résultats et vos séries restent sur cet appareil : pas de compte, pas de classement en ligne. Le résultat d\'une partie peut être copié pour être partagé.'],
];
