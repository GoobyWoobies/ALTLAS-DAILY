# Données d'ATLAS//DAILY

Toutes les données sont **statiques et embarquées** dans `data/`. Le site publié
n'appelle aucun service externe. Les fichiers sont produits par les scripts de
`tools/` à partir de sources téléchargées une seule fois dans `tools/raw/`.
Ce dossier n'est pas à publier.

| Fichier | Contenu | Produit par |
|---|---|---|
| `data/countries.json` | 194 pays : noms, alias, superficie, voisins, enclavement, centre, emprise, allongement, point culminant, niveau de difficulté | `tools/build_countries.py` |
| `data/shapes.json` | Silhouettes normalisées (Mercator, boîte de 1000 × 1000) du territoire principal | `tools/build_countries.py` |
| `data/world.json` | Contours simplifiés de tous les territoires (lon/lat), pour la carte du monde | `tools/build_countries.py` |
| `data/terrain/places.json` | 94 lieux de Terrain ID sur 4 niveaux : emprise, indices, explication (rédaction originale) | à la main (`tools/terrain_places_v2.py` trace l'ajout du 15/10/2026) |
| `data/terrain/*.webp` | Rendus de relief sans nom ni frontière | `tools/build_terrain.py` |
| `data/relief/` | Fond de relief ombré de la carte de Terrain ID : tuiles WebP de 512 px sur 4 niveaux, en projection Equal Earth | `tools/build_relief_map.py` |

## Sources et licences

| Source | Usage | Licence |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) v5 : admin-0 countries 1:10m, land, lakes, rivers | Contours, silhouettes, carte, côtes, lacs et fleuves des rendus de relief | Domaine public |
| [mledoze/countries](https://github.com/mledoze/countries) | Superficie, frontières terrestres, enclavement, région, noms français et alias | ODbL 1.0 (attribution, partage à l'identique de la base dérivée) |
| [Wikidata](https://www.wikidata.org/) : propriétés P610 (point culminant) et P2044 (altitude) | Points culminants, extraction unique le 15/10/2026 | CC0 |
| [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data, encodage Terrarium) | Altitudes des rendus de relief et du fond de carte de Terrain ID, téléchargées une fois | Attribution requise (voir ci-dessous) |

Attribution des Terrain Tiles : SRTM et GMTED2010 (NASA/USGS), ETOPO1 (NOAA),
NED et 3DEP (USGS), EU-DEM (Copernicus), Geoscience Australia, LINZ (Nouvelle-Zélande),
Kartverket (Norvège), INEGI (Mexique), ArcticDEM (PGC). La page « Sources et
licences » du site reprend ces mentions.

## Conventions (choix documentés)

- **Liste des pays** : les 193 membres de l'ONU et le Vatican, soit les pays marqués
  `independent` dans mledoze/countries.
- **Territoire principal** : silhouettes, centre, hémisphères, latitude et
  allongement portent sur le groupe de terres autour du plus grand polygone. Une île
  est rattachée au groupe si son écart reste inférieur à 0,3 × √(aire principale).
  Exemples : la France avec la Corse mais sans l'outre-mer ; l'Italie avec la Sicile
  et la Sardaigne. Exception codée en dur : pour les États-Unis, seuls les 48 États
  contigus sont retenus.
- **Entités fusionnées** (vue de jure, cohérente avec les superficies mledoze) :
  Somaliland → Somalie ; Chypre du Nord et zone tampon → Chypre ; Kosovo → Serbie ;
  Baïkonour → Kazakhstan. Le Sahara occidental reste distinct du Maroc (territoire
  non autonome selon l'ONU).
- **Superficies** : valeurs mledoze, eaux intérieures comprises. Pour la France, la
  valeur porte sur la métropole (551 695 km²).
- **Frontières terrestres** : on ne garde un voisin que s'il fait partie des 194 pays
  et si la frontière est déclarée dans les deux sens. Sri Lanka → Inde, non
  réciproque, a ainsi été écarté.
- **Points culminants** : Wikidata (valeur la plus élevée si plusieurs), avec les
  corrections de `tools/highpoint_overrides.json`. Le fichier suit la convention du
  territoire principal (Australie : Kosciuszko et non l'île Heard ; Pays-Bas :
  Vaalserberg et non Saba) et comble les valeurs manquantes (Gambie, Sénégal,
  Koweït : valeurs du CIA World Factbook). Chaque correction est justifiée dans le
  fichier.
- **Zone climatique** (Country DNA) : zone théorique déduite de la latitude du centre
  du territoire principal (tropicale < 23,44°, subtropicale < 35°, tempérée < 55°,
  froide < 66,56°, polaire au-delà). Ce n'est pas une classification de Köppen.
- **Niveaux de difficulté** des pays : niveau 1 si `LABELRANK` ≤ 2 dans Natural Earth
  ou si le pays figure dans une courte liste de silhouettes très connues ; niveau 3 si
  `LABELRANK` ≥ 6 ou si le territoire principal fait moins de 20 000 km² ; niveau 2
  sinon. Map Glitch n'utilise que les silhouettes d'au moins 2 000 km² comptant au
  moins 30 sommets (165 pays).
- **Rendus de relief** : projection de Mercator, nord en haut, exagération verticale
  croissante avec l'échelle (√(taille du pixel / 30 m), plafonnée à 9). Teintes
  hypsométriques sobres. La mer, lissée, ne sert que de contexte. Ni noms ni
  frontières.
- **Défi du jour** : graine = hash(`atlas-daily:<jeu>:<AAAA-MM-JJ UTC>:v1`). La date
  est figée au début de la partie. Si le contenu ou l'algorithme change, incrémenter
  `DAILY_VERSION` dans `assets/js/core/daily.js` modifie les défis futurs comme
  passés.

## Régénérer les données

```sh
# une fois : télécharger les sources dans tools/raw (voir les URL dans les scripts et ci-dessus)
python tools/build_countries.py
python tools/build_terrain.py            # tous les lieux
python tools/build_terrain.py alpes      # un seul lieu
python tools/build_relief_map.py         # fond de relief de la carte (tuiles Terrarium z6 en cache)
```

Niveaux de Terrain ID : 1 Facile (formes très connues), 2 Moyen (régions célèbres),
3 Difficile (reliefs régionaux précis), 4 Expert (sites de petite taille ou peu connus).
Le défi du jour suit le plan 1-2-2-3-4 ; une partie libre peut se jouer à un seul niveau.

Ajouter un lieu à Terrain ID : ajouter une entrée dans `data/terrain/places.json`
(emprise `[ouest, sud, est, nord]`, trois indices propres au lieu, une explication,
un niveau de 1 à 3), puis lancer `build_terrain.py <id>`.
