"""Render the Terrain ID relief images (data/terrain/<id>.webp).

Elevation: AWS Open Data "Terrain Tiles" (Terrarium encoding), downloaded once and
cached in tools/raw/tiles. The published site never calls this service.
  https://registry.opendata.aws/terrain-tiles/  (attribution: see DATA.md)
Water: Natural Earth 1:10m land, lakes and rivers (public domain).

The renders are deliberately label-free and border-free: hypsometric tint +
multi-directional hillshade, water in a flat muted tone, rivers as thin lines.

Run:  python tools/build_terrain.py [place_id ...]
"""
import io
import json
import math
import os
import sys
import time
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
TILES = os.path.join(RAW, "tiles")
OUT = os.path.join(HERE, "..", "data", "terrain")
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

OUT_W = 1400          # output width in px (height follows the Mercator aspect)
MAX_ZOOM = 12

# hypsometric ramp (elevation m -> colour), muted on purpose
LAND_RAMP = [
    (-500, (176, 196, 160)), (0, (184, 202, 166)), (200, (203, 211, 173)),
    (600, (221, 216, 180)), (1200, (214, 196, 160)), (2000, (196, 172, 140)),
    (3000, (176, 154, 132)), (4200, (168, 158, 152)), (5200, (214, 210, 206)),
    (6500, (246, 245, 242)),
]
SEA_RAMP = [(0, (205, 219, 226)), (-200, (190, 207, 217)), (-2000, (168, 189, 203)),
            (-6000, (146, 170, 188))]
LAKE = (178, 199, 213)
RIVER = (132, 162, 184)


def lon2x(lon, z):
    return (lon + 180.0) / 360.0 * 256 * 2 ** z


def lat2y(lat, z):
    s = math.sin(math.radians(max(-85.0, min(85.0, lat))))
    return (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 256 * 2 ** z


def y2lat(y, z):
    n = math.pi - 2 * math.pi * y / (256 * 2 ** z)
    return math.degrees(math.atan(math.sinh(n)))


def fetch_tile(z, x, y):
    n = 2 ** z
    x %= n
    path = os.path.join(TILES, str(z), str(x), f"{y}.png")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(TILE_URL.format(z=z, x=x, y=y),
                                     headers={"User-Agent": "ATLAS-DAILY-databuild/1.0"})
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(req, timeout=60).read()
                break
            except Exception:  # noqa: BLE001 - retry transient network errors
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        with open(path, "wb") as f:
            f.write(data)
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768


def pick_zoom(bbox):
    w, s, e, n = bbox
    for z in range(3, MAX_ZOOM + 1):
        if lon2x(e, z) - lon2x(w, z) >= OUT_W * 0.9:
            return z
    return MAX_ZOOM


def mosaic(bbox, z):
    w, s, e, n = bbox
    px0, px1 = lon2x(w, z), lon2x(e, z)
    py0, py1 = lat2y(n, z), lat2y(s, z)
    tx0, tx1 = int(px0 // 256), int(px1 // 256)
    ty0, ty1 = int(py0 // 256), int(py1 // 256)
    grid = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            grid[(ty - ty0) * 256:(ty - ty0 + 1) * 256,
                 (tx - tx0) * 256:(tx - tx0 + 1) * 256] = fetch_tile(z, tx, ty)
    ox, oy = tx0 * 256, ty0 * 256
    crop = grid[int(py0 - oy):int(math.ceil(py1 - oy)), int(px0 - ox):int(math.ceil(px1 - ox))]
    return crop, (px0, py0)


def ramp(values, stops):
    xs = np.array([s[0] for s in stops], dtype=np.float64)
    out = np.zeros(values.shape + (3,))
    order = np.argsort(xs)
    xs = xs[order]
    cols = np.array([stops[i][1] for i in order], dtype=np.float64)
    for c in range(3):
        out[..., c] = np.interp(values, xs, cols[:, c])
    return out


def box_blur(a, r):
    """Separable box blur (3 passes approximate a gaussian)."""
    if r < 1:
        return a
    out = a.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0), (0, 0)]
            pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis)
            if axis == 0:
                out = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
            else:
                out = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return out


def hillshade(elev, cell_m, zfac):
    gy, gx = np.gradient(elev * zfac, cell_m)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    shade = np.zeros_like(elev)
    # weighted multi-directional illumination, dominant from the north-west
    for az, wgt in ((315, 0.55), (270, 0.2), (360, 0.15), (225, 0.1)):
        a = math.radians(360 - az + 90)
        alt = math.radians(45)
        shade += wgt * (np.sin(alt) * np.cos(slope) +
                        np.cos(alt) * np.sin(slope) * np.cos(a - aspect))
    return np.clip(shade, 0, 1)


def load_features(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as f:
        return json.load(f)["features"]


def geom_parts(g):
    if g["type"] in ("Polygon", "LineString"):
        return [g["coordinates"]]
    return g["coordinates"]


def intersects(coords_bbox, bbox):
    return not (coords_bbox[2] < bbox[0] or coords_bbox[0] > bbox[2] or
                coords_bbox[3] < bbox[1] or coords_bbox[1] > bbox[3])


def render(place, layers):
    bbox = place["bbox"]
    z = pick_zoom(bbox)
    elev, (px0, py0) = mosaic(bbox, z)
    h0, w0 = elev.shape
    scale = OUT_W / w0
    out_h = int(round(h0 * scale))

    def to_px(lon, lat):
        return ((lon2x(lon, z) - px0) * scale, (lat2y(lat, z) - py0) * scale)

    # resample elevation to output size
    eimg = Image.fromarray(elev.astype(np.float32), mode="F").resize((OUT_W, out_h), Image.BILINEAR)
    e = np.asarray(eimg, dtype=np.float64)

    # masks (drawn at 2x then reduced for anti-aliasing)
    ss = 2
    land = Image.new("L", (OUT_W * ss, out_h * ss), 0)
    dl = ImageDraw.Draw(land)
    lakes = Image.new("L", (OUT_W * ss, out_h * ss), 0)
    dk = ImageDraw.Draw(lakes)
    ext = (bbox[0] - 1, bbox[1] - 1, bbox[2] + 1, bbox[3] + 1)
    for feats, draw in ((layers["land"], dl), (layers["lakes"], dk)):
        for f in feats:
            if not intersects(f["_bbox"], ext):
                continue
            for poly in geom_parts(f["geometry"]):
                for k, ring in enumerate(poly):
                    pts = [tuple(v * ss for v in to_px(c[0], c[1])) for c in ring]
                    if len(pts) >= 3:
                        draw.polygon(pts, fill=0 if k else 255)
    land = np.asarray(land.resize((OUT_W, out_h), Image.LANCZOS), dtype=np.float64) / 255
    lakes = np.asarray(lakes.resize((OUT_W, out_h), Image.LANCZOS), dtype=np.float64) / 255

    mid_lat = (bbox[1] + bbox[3]) / 2
    cell_m = 40075016.686 * math.cos(math.radians(mid_lat)) / (256 * 2 ** z) / scale
    zfac = float(np.clip(math.sqrt(cell_m / 30.0), 1.0, 9.0))
    shade = hillshade(e, cell_m, zfac)
    # bathymetry mixes sources of very different resolution (blocky in places):
    # smooth it strongly, it is only context
    sea_e = box_blur(np.minimum(e, 0), max(2, OUT_W // 120))
    sea_shade = hillshade(sea_e, cell_m, zfac * 0.2)

    land_rgb = ramp(e, LAND_RAMP)
    land_rgb *= (0.62 + 0.55 * shade)[..., None]
    sea_rgb = ramp(sea_e, SEA_RAMP) * (0.92 + 0.1 * sea_shade)[..., None]
    rgb = land_rgb * land[..., None] + sea_rgb * (1 - land[..., None])
    lake_rgb = np.array(LAKE, dtype=np.float64)
    rgb = rgb * (1 - lakes[..., None]) + lake_rgb * lakes[..., None]
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")

    # rivers: width by Natural Earth importance, scaled to the zoom
    big = Image.new("RGBA", (OUT_W * ss, out_h * ss), (0, 0, 0, 0))
    dr = ImageDraw.Draw(big)
    base = max(0.6, min(2.2, 12.0 / max(bbox[2] - bbox[0], bbox[3] - bbox[1])))
    for f in layers["rivers"]:
        if not intersects(f["_bbox"], ext):
            continue
        rank = f["properties"].get("scalerank") or 10
        width = max(1, int(round(ss * base * max(0.5, (11 - rank) / 6))))
        for line in geom_parts(f["geometry"]):
            pts = [tuple(v * ss for v in to_px(c[0], c[1])) for c in line]
            if len(pts) >= 2:
                dr.line(pts, fill=RIVER + (235,), width=width, joint="curve")
    big = big.resize((OUT_W, out_h), Image.LANCZOS)
    img.paste(big, (0, 0), big)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, place["id"] + ".webp")
    img.save(path, "WEBP", quality=80, method=6)
    return z, img.size, os.path.getsize(path)


def with_bbox(features):
    for f in features:
        xs, ys = [], []
        for part in geom_parts(f["geometry"]):
            rings = part if f["geometry"]["type"].endswith("Polygon") else [part]
            for r in rings:
                xs.extend(c[0] for c in r)
                ys.extend(c[1] for c in r)
        f["_bbox"] = (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, -1, -1)
    return features


def main():
    with open(os.path.join(OUT, "places.json"), encoding="utf-8") as f:
        places = json.load(f)
    only = set(sys.argv[1:])
    layers = {
        "land": with_bbox(load_features("ne_10m_land.geojson")),
        "lakes": with_bbox(load_features("ne_10m_lakes.geojson")),
        "rivers": with_bbox(load_features("ne_10m_rivers_lake_centerlines.geojson")),
    }
    for p in places:
        if only and p["id"] not in only:
            continue
        z, size, nbytes = render(p, layers)
        print(f"{p['id']:<20} z{z} {size[0]}x{size[1]} {nbytes // 1024} KB", flush=True)


if __name__ == "__main__":
    main()
