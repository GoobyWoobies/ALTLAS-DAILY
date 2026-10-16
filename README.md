# ATLAS//DAILY

Trois jeux de géographie quotidiens, dans une seule interface :

- **Map Glitch** : reconnaître un pays dont la silhouette réelle a été déformée.
- **Terrain ID** : situer sur la carte du monde un relief présenté sans nom ni frontière.
- **Country DNA** : identifier un pays à partir de sa fiche d'identité géographique.

Chaque jeu propose un **défi du jour**, identique pour tous et renouvelé à minuit UTC,
ainsi que des **parties libres**. Le site ne demande aucun compte. Les statistiques
sont enregistrées dans le navigateur (localStorage).

## Stack

HTML, CSS et JavaScript (modules ES natifs), **sans framework ni étape de build**.
Les données sont des fichiers JSON et WebP statiques (voir [DATA.md](DATA.md)).
Python 3 (numpy, Pillow) ne sert qu'à régénérer les données, dans `tools/`.

## Lancer en local

Le site doit être servi en HTTP : les modules ES ne se chargent pas en `file://`.

```sh
python tools/serve.py 8080
# puis ouvrir http://localhost:8080/
```

`tools/serve.py` force les bons types MIME. Sous Windows, le registre associe parfois
`.js` à `text/plain`, ce qui bloque les modules.

## Publier

Copier sur n'importe quel hébergement statique (GitHub Pages, Netlify, Cloudflare
Pages, un serveur nginx…) les fichiers suivants :

```
index.html
assets/
data/
```

`tools/`, `tests/` et `tools/raw/` ne sont pas nécessaires en production. Le site
n'utilise aucune clé, aucune API et aucune ressource tierce (polices système
comprises).

## Tests

Les tests s'exécutent dans le navigateur, serveur local lancé :

- `http://localhost:8080/tests/unit.html` : règles, calculs géographiques, scores,
  intégrité des données, validité de 366 défis quotidiens.
- `http://localhost:8080/tests/e2e.html` : joue réellement le défi du jour des trois
  jeux dans une iframe (saisie, Entrée, clics sur la carte) et vérifie scores,
  sauvegardes et reprise. Vérifie aussi les pages (règles, légal, 404), les liens
  du pied de page, la fenêtre d'aide en jeu, la présence de toutes les tuiles du
  fond de relief et la reprise après un échec de chargement simulé. Ce test
  **efface les données locales** de l'origine `localhost`.
- `http://localhost:8080/tests/layout.html` : aucun débordement horizontal, de 360 à
  1920 px de large, sur toutes les pages.

Le titre de la page passe à `PASS n` ou `FAIL x/n`. En ligne de commande :

```sh
brave --headless=new --virtual-time-budget=240000 --dump-dom http://localhost:8080/tests/unit.html
```

## Organisation du code

```
assets/js/
  main.js                 routeur (#/…), en-tête, pied de page, accueil, statistiques, sources
  pages/rules.js          page « Règles du jeu »
  pages/legal.js          mentions légales, politique de confidentialité
  core/                   logique sans DOM
    site.js               nom du site et de l'auteur
    rng.js                générateur pseudo-aléatoire déterministe
    daily.js              date UTC, graine quotidienne
    geo.js                haversine, cap, projection Equal Earth, polygones
    countries.js          correspondance des noms, autocomplétion
    session.js            manches, résultats, persistance du défi du jour
    storage.js            localStorage, statistiques, séries
    data.js               chargement des JSON
  games/<jeu>/rules.js    règles et scores (purs, testés)
  games/<jeu>/view.js     écran du jeu
  ui/                     composants : carte du monde, silhouette, saisie, visionneuse
    help.js               texte des règles (écran d'accueil des jeux, page Règles, aide en jeu)
    screens.js            accueil d'un jeu, lancement (chargement / erreur), barre de jeu, résultats
assets/css/app.css
data/                     données générées (voir DATA.md)
tools/                    scripts Python de génération des données
tests/                    tests unitaires et de bout en bout
```
