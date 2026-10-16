// Legal pages: legal notice and privacy policy.
// Written from what the site actually does: static files, no account, no
// cookie, no analytics, no third-party request; game data kept in the
// browser's localStorage. Facts the publisher has not given yet are marked
// "à compléter" on the page rather than invented.
import { h } from '../ui/dom.js';
import { SITE, AUTHOR } from '../core/site.js';

const UPDATED = '16/10/2026';

/** Placeholder for information only the publisher can provide. */
function todo(text) {
  return h('span', { class: 'todo' }, h('span', { class: 'todo-tag' }, 'À compléter par l\'éditeur'), ' ', text);
}

export function legalNotice(view) {
  view.append(
    h('article', { class: 'page prose legal' },
      h('p', { class: 'kicker' }, 'Informations légales'),
      h('h1', { class: 'page-title' }, 'Mentions légales'),
      h('p', { class: 'lede' }, `Informations sur l'éditeur et l'hébergeur de ${SITE}.`),

      h('h2', null, 'Éditeur'),
      h('p', null, `${SITE} est un site de jeux de géographie créé et édité à titre personnel et non professionnel par ${AUTHOR}.`),
      h('ul', null,
        h('li', null, 'Responsable de la publication : ', AUTHOR, '.'),
        h('li', null, 'Identité (nom et prénom) : ', todo('à indiquer ici, ou à communiquer à l\'hébergeur si l\'éditeur, non professionnel, souhaite rester anonyme (art. 6, III-2 de la loi n° 2004-575 du 21 juin 2004).')),
        h('li', null, 'Contact : ', todo('adresse électronique ou formulaire de contact.'))),

      h('h2', null, 'Hébergement'),
      h('p', null, 'Le site est hébergé par GitHub Pages, service de GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (', h('a', { href: 'https://github.com', rel: 'noopener' }, 'github.com'), ').'),

      h('h2', null, 'Propriété intellectuelle'),
      h('p', null, `© ${new Date().getFullYear()} ${SITE} — créé par ${AUTHOR}. Les éléments originaux du site sont protégés par le droit d'auteur : code source, conception graphique et interface, mécaniques et textes des jeux (règles, indices, explications des lieux), rendus de relief et fonds de carte produits pour le site.`),
      h('p', null, 'Toute reproduction, représentation, redistribution ou réutilisation de ces éléments, totale ou partielle, sans autorisation préalable de l\'auteur est interdite, sous réserve des exceptions prévues par la loi (notamment la courte citation et l\'usage privé).'),
      h('p', null, 'Les données cartographiques et géographiques d\'origine tierce restent soumises à leur propre licence et ne sont pas revendiquées par l\'éditeur : contours Natural Earth (domaine public), données mledoze/countries (ODbL 1.0, la base dérivée reste sous cette licence), Wikidata (CC0), altitudes Terrain Tiles (attribution aux producteurs). Le détail figure sur la page ',
        h('a', { href: '#/sources' }, 'Sources et licences'), '.'),
      h('p', null, 'Les noms des pays et des lieux sont des faits géographiques et ne font l\'objet d\'aucune appropriation.'),

      h('h2', null, 'Responsabilité'),
      h('p', null, 'Les informations géographiques présentées le sont à des fins de jeu. Elles sont établies avec soin à partir des sources citées, mais peuvent comporter des simplifications ou des erreurs. Les frontières et dénominations n\'expriment aucune prise de position politique.'),

      h('h2', null, 'Données personnelles'),
      h('p', null, 'Le site ne crée aucun compte et ne dépose aucun cookie. Voir la ', h('a', { href: '#/confidentialite' }, 'politique de confidentialité'), '.'),

      h('p', { class: 'note' }, `Dernière mise à jour : ${UPDATED}.`)));
}

export function privacy(view) {
  view.append(
    h('article', { class: 'page prose legal' },
      h('p', { class: 'kicker' }, 'Informations légales'),
      h('h1', { class: 'page-title' }, 'Politique de confidentialité'),
      h('p', { class: 'lede' }, `${SITE} fonctionne sans compte, sans cookie et sans outil de mesure d'audience. Vos parties restent dans votre navigateur.`),

      h('h2', null, 'En résumé'),
      h('ul', null,
        h('li', null, 'Aucun compte, aucune inscription, aucune adresse demandée.'),
        h('li', null, 'Aucun cookie, aucun outil d\'analyse, aucune publicité, aucun traceur.'),
        h('li', null, 'Aucune ressource tierce : polices, images et données sont servies par le site lui-même.'),
        h('li', null, 'Vos scores et préférences sont enregistrés uniquement sur votre appareil.')),

      h('h2', null, 'Données enregistrées sur votre appareil'),
      h('p', null, 'Le site utilise le stockage local du navigateur (localStorage). Ces informations ne sont jamais transmises au site ni à un tiers :'),
      h('ul', null,
        h('li', null, h('code', null, 'atlas-daily:v1'), ' : progression des défis du jour, historique des parties, statistiques et séries ;'),
        h('li', null, h('code', null, 'atlas-daily:level:…'), ' : niveau choisi pour les parties libres ;'),
        h('li', null, h('code', null, 'atlas-daily:map-style'), ' : fond de carte choisi (relief ou plan).')),
      h('p', null, 'Ce stockage est strictement nécessaire au service que vous demandez (reprendre un défi, afficher vos statistiques) : il ne requiert pas de consentement. Vous pouvez l\'effacer à tout moment avec le bouton « Effacer les données locales » de la page ',
        h('a', { href: '#/stats' }, 'Statistiques'), ', ou depuis les réglages de votre navigateur.'),

      h('h2', null, 'Copie du résultat'),
      h('p', null, 'Le bouton « Copier le résultat » place un court texte (scores et symboles, sans donnée personnelle) dans votre presse-papiers. Rien n\'est envoyé : vous choisissez seul de le partager.'),

      h('h2', null, 'Hébergement et journaux techniques'),
      h('p', null, 'Comme tout site web, l\'hébergeur reçoit les données techniques nécessaires à l\'affichage des pages (adresse IP, navigateur, pages demandées). GitHub Pages indique enregistrer l\'adresse IP des visiteurs pour des raisons de sécurité. Ces données sont traitées par GitHub, Inc. selon sa propre ',
        h('a', { href: 'https://docs.github.com/fr/site-policy/privacy-policies/github-general-privacy-statement', rel: 'noopener' }, 'déclaration de confidentialité'),
        '. L\'éditeur n\'y a pas accès et n\'utilise aucun outil de statistiques de fréquentation.'),

      h('h2', null, 'Vos droits'),
      h('p', null, 'Les données de jeu étant conservées uniquement sur votre appareil, vous en gardez la maîtrise complète : vous pouvez les consulter et les effacer vous-même. Pour toute question relative à vos données, ou pour exercer vos droits au titre du RGPD, contactez l\'éditeur : ',
        todo('adresse électronique de contact.'),
        ' Vous pouvez aussi adresser une réclamation à la CNIL (', h('a', { href: 'https://www.cnil.fr', rel: 'noopener' }, 'cnil.fr'), ').'),

      h('p', { class: 'note' }, `Dernière mise à jour : ${UPDATED}.`)));
}
