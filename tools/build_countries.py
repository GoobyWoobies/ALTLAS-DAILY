"""Build data/countries.json, data/shapes.json and data/world.json.

Sources (downloaded once into tools/raw, see DATA.md):
  - Natural Earth 1:10m admin-0 countries (public domain): geometry, French names, label rank.
  - mledoze/countries (ODbL 1.0): area, land borders, landlocked flag, region, French names.
  - Wikidata (CC0), one-off SPARQL export: highest point of each country,
    corrected by tools/highpoint_overrides.json.

Run:  python tools/build_countries.py
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from geoutil import (bbox, bbox_gap, local_km, mercator, ring_area, ring_centroid,  # noqa: E402
                     ring_gap, simplify_ring, wrap_lon)

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "data")

# Natural Earth splits some de jure territories into separate features.
# We follow the UN-recognised (de jure) extent so that geometry matches the
# mledoze areas and border lists.
NE_TO_ID = {"SDS": "SSD", "SOL": "SOM", "CYN": "CYP", "CNM": "CYP", "KOS": "SRB", "KAB": "KAZ"}

# Countries whose overseas parts are close enough to be swept into the
# silhouette cluster but are not part of the familiar outline.
SILHOUETTE_FILTER = {
    # contiguous United States only (Alaska and Hawaii are drawn elsewhere on every map)
    "USA": lambda lon, lat: -130 < lon < -60 and 24 < lat < 50,
}

CONTINENT_FR = {
    "Africa": "Afrique", "Asia": "Asie", "Europe": "Europe", "Oceania": "Océanie",
}
SUBREGION_FR = {
    "Northern Africa": "Afrique du Nord", "Western Africa": "Afrique de l'Ouest",
    "Middle Africa": "Afrique centrale", "Eastern Africa": "Afrique de l'Est",
    "Southern Africa": "Afrique australe", "North America": "Amérique du Nord",
    "Central America": "Amérique centrale", "Caribbean": "Caraïbes",
    "South America": "Amérique du Sud", "Western Asia": "Asie de l'Ouest",
    "Central Asia": "Asie centrale", "Southern Asia": "Asie du Sud",
    "Eastern Asia": "Asie de l'Est", "South-Eastern Asia": "Asie du Sud-Est",
    "Northern Europe": "Europe du Nord", "Western Europe": "Europe de l'Ouest",
    "Southern Europe": "Europe du Sud", "Eastern Europe": "Europe de l'Est",
    "Southeast Europe": "Europe du Sud-Est", "Central Europe": "Europe centrale",
    "Australia and New Zealand": "Australie et Nouvelle-Zélande",
    "Melanesia": "Mélanésie", "Micronesia": "Micronésie", "Polynesia": "Polynésie",
}

# Shapes that most players know well even when the country is not a "major" one
# in Natural Earth's label ranking. Used only to pick the difficulty tier.
WELL_KNOWN = {
    "ITA", "GBR", "JPN", "CHL", "FRA", "ESP", "DEU", "GRC", "NZL", "MDG", "CUB", "ISL",
    "IRL", "NOR", "SWE", "FIN", "EGY", "ZAF", "TUR", "KOR", "PHL", "VNM", "THA", "UKR",
    "POL", "PRT", "IRN", "PER", "COL", "MNG", "LKA", "SOM", "NGA", "PAK", "MAR", "ETH",
}

# Extra spellings players commonly type (beyond the dataset names).
EXTRA_ALIASES = {
    "USA": ["USA", "US", "Etats-Unis d'Amerique", "Amerique", "America"],
    "GBR": ["UK", "Angleterre", "Grande-Bretagne", "Great Britain", "England"],
    "COD": ["RDC", "RD Congo", "Congo-Kinshasa", "DR Congo", "Congo Kinshasa"],
    "COG": ["Congo-Brazzaville", "Congo Brazzaville", "Republique du Congo"],
    "CZE": ["Republique tcheque", "Czech Republic"],
    "MMR": ["Birmanie", "Burma"],
    "CIV": ["Cote d'Ivoire", "Ivory Coast"],
    "PRK": ["Coree du Nord", "North Korea"],
    "KOR": ["Coree du Sud", "South Korea", "Coree"],
    "ARE": ["EAU", "Emirats", "UAE", "Emirats arabes unis"],
    "MKD": ["Macedoine", "Macedoine du Nord", "Macedonia"],
    "SWZ": ["Swaziland", "Eswatini"],
    "TLS": ["Timor oriental", "East Timor", "Timor-Leste"],
    "CPV": ["Cap-Vert", "Cabo Verde", "Cape Verde"],
    "VAT": ["Vatican", "Saint-Siege", "Holy See"],
    "NLD": ["Hollande", "Holland"],
    "BIH": ["Bosnie", "Bosnia"],
    "CAF": ["Centrafrique", "RCA"],
    "DOM": ["Republique dominicaine", "Dominican Republic"],
    "FSM": ["Micronesie", "Micronesia"],
    "RUS": ["Russie", "Russia"],
    "TUR": ["Turquie", "Turkiye", "Turkey"],
}

GAP_FACTOR = 0.3          # max gap between islands of one silhouette, x sqrt(main area)
MIN_PART_SHARE = 0.0004   # drop slivers smaller than this share of the main polygon
SIL_TOL = 0.0015          # silhouette simplification, share of the largest dimension
SIL_SIZE = 1000           # silhouettes are normalised into a 1000 x 1000 box
WORLD_TOL_DEG = 0.04      # world map simplification tolerance (degrees)


def load(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as f:
        return json.load(f)


def polygons_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]


def main_cluster(polys, cid):
    """Return (polygons kept for the silhouette, (lon0, lat0) of the main polygon)."""
    keep_fn = SILHOUETTE_FILTER.get(cid)
    if keep_fn:
        polys = [p for p in polys if keep_fn(*ring_centroid([tuple(c) for c in p[0]]))]
    # projected km coordinates around the largest polygon (by rough degree area first)
    largest = max(polys, key=lambda p: abs(ring_area([tuple(c[:2]) for c in p[0]])
                                           * math.cos(math.radians(p[0][0][1]))))
    lon0, lat0 = ring_centroid([tuple(c[:2]) for c in largest[0]])
    proj = []
    for p in polys:
        outer = [local_km(c[0], c[1], lon0, lat0) for c in p[0]]
        proj.append((p, outer, abs(ring_area(outer)), bbox(outer)))
    proj.sort(key=lambda t: -t[2])
    main_area = proj[0][2]
    max_gap = GAP_FACTOR * math.sqrt(main_area)
    cluster = [proj[0]]
    rest = [t for t in proj[1:] if t[2] >= MIN_PART_SHARE * main_area]
    changed = True
    while changed:
        changed = False
        for t in list(rest):
            for c in cluster:
                if bbox_gap(t[3], c[3]) > max_gap:
                    continue
                step = max(1, len(t[1]) // 200)
                cstep = max(1, len(c[1]) // 400)
                if ring_gap(t[1][::step], c[1][::cstep]) <= max_gap:
                    cluster.append(t)
                    rest.remove(t)
                    changed = True
                    break
    return [t[0] for t in cluster], (lon0, lat0)


def silhouette(polys, lon0):
    """Mercator-project, simplify and normalise polygons into a SIL_SIZE box."""
    rings = []  # (is_hole, [(x, y)])
    for p in polys:
        for k, r in enumerate(p):
            pts = [mercator(wrap_lon(c[0], lon0), c[1]) for c in r]
            rings.append((k > 0, [(x, -y) for x, y in pts]))
    allpts = [pt for _, r in rings for pt in r]
    x0, y0, x1, y1 = bbox(allpts)
    span = max(x1 - x0, y1 - y0)
    tol = SIL_TOL * span
    out = []
    total_pts = 0
    outer_area = max(abs(ring_area(r)) for h, r in rings if not h)
    for is_hole, r in rings:
        if abs(ring_area(r)) < MIN_PART_SHARE * outer_area:
            continue
        s = simplify_ring(r, tol)
        if len(s) < 3:
            continue
        flat = []
        for x, y in s:
            flat.append(round((x - x0) / span * SIL_SIZE))
            flat.append(round((y - y0) / span * SIL_SIZE))
        out.append(flat)
        total_pts += len(s)
    w = round((x1 - x0) / span * SIL_SIZE, 1)
    h = round((y1 - y0) / span * SIL_SIZE, 1)
    return {"w": w, "h": h, "rings": out}, total_pts


def island_share(polys, lon0, lat0):
    """Share of the largest island in the whole land area. Polygons that share
    border vertices (e.g. Cyprus split by Natural Earth into several features)
    are merged into one island first."""
    parent = list(range(len(polys)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    owner = {}
    for i, p in enumerate(polys):
        for c in p[0]:
            key = (round(c[0], 5), round(c[1], 5))
            if key in owner:
                parent[find(i)] = find(owner[key])
            else:
                owner[key] = i
    areas = {}
    for i, p in enumerate(polys):
        a = abs(ring_area([local_km(c[0], c[1], lon0, lat0) for c in p[0]]))
        areas[find(i)] = areas.get(find(i), 0) + a
    return round(max(areas.values()) / sum(areas.values()), 3)


def elongation(polys, lon0, lat0):
    """Ratio of principal axes of the main territory (1 = compact)."""
    pts = [local_km(c[0], c[1], lon0, lat0) for p in polys for c in p[0]]
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - mx) ** 2 for p in pts) / n
    syy = sum((p[1] - my) ** 2 for p in pts) / n
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts) / n
    tr, det = sxx + syy, sxx * syy - sxy * sxy
    disc = math.sqrt(max(0.0, tr * tr / 4 - det))
    l1, l2 = tr / 2 + disc, tr / 2 - disc
    return round(math.sqrt(l1 / l2), 2) if l2 > 0 else 99.0


def cluster_centroid(polys, lon0, lat0):
    sx = sy = sa = 0.0
    k = math.pi / 180 * 6371.0088
    for p in polys:
        outer = [local_km(c[0], c[1], lon0, lat0) for c in p[0]]
        a = abs(ring_area(outer))
        cx, cy = ring_centroid(outer)
        sx += cx * a
        sy += cy * a
        sa += a
    cx, cy = sx / sa, sy / sa
    lat = lat0 + cy / k
    lon = lon0 + cx / (k * math.cos(math.radians(lat0)))
    lon = ((lon + 180) % 360) - 180
    return round(lat, 2), round(lon, 2)


def highpoints(ids):
    raw = load("wikidata_highpoints.json")["results"]["bindings"]
    inv = {v: k for k, v in load("wikidata_ids.json").items()}
    best = {}
    for b in raw:
        cid = inv.get(b["c"]["value"].rsplit("/", 1)[1])
        if not cid or "elev" not in b:
            continue
        elev = float(b["elev"]["value"])
        name = b.get("peakLabelFr", b["peakLabel"])["value"]
        if cid not in best or elev > best[cid]["elev"]:
            best[cid] = {"name": name, "elev": round(elev)}
    with open(os.path.join(HERE, "highpoint_overrides.json"), encoding="utf-8") as f:
        overrides = json.load(f)
    for cid, o in overrides.items():
        if cid.startswith("_"):
            continue
        best[cid] = {"name": o["name"], "elev": o["elev"]}
    missing = [c for c in ids if c not in best]
    if missing:
        print("WARNING no highest point for", missing)
    return best


def main():
    mled = [c for c in load("mledoze_countries.json") if c.get("independent")]
    ids = {c["cca3"] for c in mled}
    ne = load("ne_10m_admin_0_countries.geojson")["features"]

    geoms, ne_props = {}, {}
    world = []
    for f in ne:
        p = f["properties"]
        a3 = p["ADM0_A3"]
        cid = NE_TO_ID.get(a3, a3)
        cid = cid if cid in ids else None
        polys = polygons_of(f["geometry"])
        if cid:
            geoms.setdefault(cid, []).extend(polys)
            if a3 == cid or cid not in ne_props:
                ne_props[cid] = p
        # world map layer
        wpolys = []
        for poly in polys:
            rings = []
            for r in poly:
                s = simplify_ring([tuple(c[:2]) for c in r], WORLD_TOL_DEG)
                if len(s) >= 3:
                    rings.append([v for c in s for v in (round(c[0], 2), round(c[1], 2))])
            if rings:
                wpolys.append(rings)
        if wpolys:
            world.append({"id": cid, "p": wpolys})

    hp = highpoints(ids)
    countries, shapes = [], {}
    for c in sorted(mled, key=lambda c: c["cca3"]):
        cid = c["cca3"]
        p = ne_props[cid]
        polys, (lon0, lat0) = main_cluster(geoms[cid], cid)
        shp, npts = silhouette(polys, lon0)
        shapes[cid] = shp
        lat, lon = cluster_centroid(polys, lon0, lat0)
        lats = [pt[1] for poly in polys for pt in poly[0]]
        lons = [wrap_lon(pt[0], lon0) for poly in polys for pt in poly[0]]
        fra = c["translations"]["fra"]["common"]
        aliases = {c["name"]["common"], c["name"]["official"], c["translations"]["fra"]["official"],
                   p["NAME_FR"], p["NAME_EN"], p["ADMIN"]}
        aliases.update(c.get("altSpellings", []))
        aliases.update(EXTRA_ALIASES.get(cid, []))
        aliases = sorted(a for a in aliases if a and a != fra and len(a) > 1)
        region = c["region"]
        sub = c["subregion"]
        if region == "Americas":
            continent = "Amérique du Sud" if sub == "South America" else "Amérique du Nord"
        else:
            continent = CONTINENT_FR[region]
        part_areas = [abs(ring_area([local_km(x[0], x[1], lon0, lat0) for x in poly[0]])) for poly in polys]
        area_main_km2 = sum(part_areas)
        rank = p["LABELRANK"]
        if rank <= 2 or cid in WELL_KNOWN:
            tier = 1
        elif rank >= 6 or area_main_km2 < 20000:
            tier = 3
        else:
            tier = 2
        borders = sorted(b for b in c.get("borders", []) if b in ids
                         and cid in next(m for m in mled if m["cca3"] == b).get("borders", []))
        countries.append({
            "id": cid,
            "name": fra,
            "nameEn": c["name"]["common"],
            "aliases": aliases,
            "continent": continent,
            "subregion": SUBREGION_FR.get(sub, sub),
            "area": round(c["area"]) if c["area"] >= 100 else round(c["area"], 2),
            "borders": borders,
            "landlocked": bool(c["landlocked"]),
            "lat": lat,
            "lon": lon,
            "latMin": round(min(lats), 2),
            "latMax": round(max(lats), 2),
            "lonMin": round(((min(lons) + 180) % 360) - 180, 2),
            "lonMax": round(((max(lons) + 180) % 360) - 180, 2),
            "elongation": elongation(polys, lon0, lat0),
            "parts": len(polys),
            "mainShare": island_share(geoms[cid], lon0, lat0),
            "highPoint": hp.get(cid),
            "tier": tier,
            "glitch": area_main_km2 >= 2000 and npts >= 30,
        })

    # symmetric check of border lists
    by = {c["id"]: c for c in countries}
    for c in countries:
        for b in c["borders"]:
            if c["id"] not in by[b]["borders"]:
                print("WARNING asymmetric border", c["id"], b)

    os.makedirs(OUT, exist_ok=True)
    dump(os.path.join(OUT, "countries.json"), countries)
    dump(os.path.join(OUT, "shapes.json"), shapes)
    dump(os.path.join(OUT, "world.json"), world)
    print(len(countries), "countries,", sum(c["glitch"] for c in countries), "glitch-eligible")
    for t in (1, 2, 3):
        print("tier", t, sum(1 for c in countries if c["tier"] == t and c["glitch"]))


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(os.path.basename(path), round(os.path.getsize(path) / 1024), "KB")


if __name__ == "__main__":
    main()
