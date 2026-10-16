"""Build the relief background of the Terrain ID world map (data/relief/).

Elevation: AWS Open Data "Terrain Tiles" (Terrarium encoding), zoom 6, downloaded
once and cached in tools/raw/tiles (shared with build_terrain.py; see DATA.md).
Land and lakes: Natural Earth 1:10m (public domain).

The map uses the same hypsometric tints and hillshade as the Terrain ID renders,
so a relief seen in a round looks the same on the answer map. Steps:
  1. global plate carree elevation grid (lat 85..-60) sampled from the tiles;
  2. colour: hypsometric tint + hillshade on land, smoothed bathymetry at sea,
     flat tone on lakes;
  3. reprojection to the Equal Earth frame of assets/js/ui/worldMap.js
     (latitudes -58..84, SVG units = projection units x 100), cut into 512 px
     WebP tiles at 4 zoom levels. Pixels outside the projection outline are
     transparent; fully empty tiles are not written.

Run:  python tools/build_relief_map.py
"""
import json
import math
import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageDraw

from build_terrain import (LAKE, LAND_RAMP, SEA_RAMP, fetch_tile, geom_parts, lat2y,
                           load_features, lon2x, ramp)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "relief")

K = 100.0          # same scale as assets/js/ui/worldMap.js
LAT_TOP = 84.0
LAT_BOTTOM = -58.0
TILE = 512
LEVEL_WIDTHS = [2048, 4096, 8192, 16384]

Z = 6              # source tile zoom (~2.4 km per pixel at the equator)
RES = 0.02         # plate carree grid step, degrees
GRID_N, GRID_S = 85.0, -60.0
CELL_M = 40075016.686 / 360.0 * RES
ZFAC = 9.0         # vertical exaggeration (cap used by build_terrain.py)

A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def ee_forward(lon, lat):
    th = math.asin(M * math.sin(math.radians(lat)))
    t2 = th * th
    t6 = t2 ** 3
    x = math.radians(lon) * math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


def ee_inverse(x, y):
    """Vectorised inverse Equal Earth. Returns lon, lat (degrees) and a validity mask."""
    th = y.copy()
    for _ in range(12):
        t2 = th * th
        t6 = t2 ** 3
        f = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y
        fp = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)
        th -= f / fp
    t2 = th * th
    t6 = t2 ** 3
    fp = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)
    s = np.sin(th) / M
    lat = np.degrees(np.arcsin(np.clip(s, -1, 1)))
    lon = np.degrees(M * x * fp / np.cos(th))
    valid = (np.abs(s) <= 1) & (np.abs(lon) <= 180)
    return lon, lat, valid


def elevation_grid():
    """Plate carree elevation (float32, rows from GRID_N southwards)."""
    n = 2 ** Z
    ty0 = int(lat2y(GRID_N, Z) // 256)
    ty1 = int(lat2y(GRID_S, Z) // 256)
    jobs = [(Z, tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(n)]
    with ThreadPoolExecutor(8) as pool:  # download (once) in parallel
        for i, _ in enumerate(pool.map(lambda j: fetch_tile(*j) is not None, jobs)):
            if i % 64 == 0:
                print(f"tiles {i}/{len(jobs)}", end="\r", flush=True)
    print(f"tiles {len(jobs)}/{len(jobs)}")

    W = int(round(360 / RES))
    H = int(round((GRID_N - GRID_S) / RES))
    lons = -180 + (np.arange(W) + 0.5) * RES
    lats = GRID_N - (np.arange(H) + 0.5) * RES
    px = np.array([lon2x(v, Z) for v in lons]) - 0.5
    py = np.array([lat2y(v, Z) for v in lats]) - 0.5
    grid = np.zeros((H, W), dtype=np.float32)
    # one band of tile rows at a time
    for ty in range(ty0, ty1 + 1):
        rows = np.nonzero((py >= ty * 256 - 0.5) & (py < (ty + 1) * 256 - 0.5))[0]
        if not len(rows):
            continue
        band_t0 = max(ty0, ty - 1)
        band_t1 = min(ty1, ty + 1)
        band = np.concatenate([np.concatenate([fetch_tile(Z, tx, t) for tx in range(n)], axis=1)
                               for t in range(band_t0, band_t1 + 1)], axis=0).astype(np.float32)
        bw = band.shape[1]
        y = py[rows] - band_t0 * 256
        y0 = np.clip(np.floor(y).astype(int), 0, band.shape[0] - 2)
        fy = np.clip(y - y0, 0, 1)[:, None]
        x0 = np.floor(px).astype(int)
        fx = (px - x0)[None, :]
        xa, xb = x0 % bw, (x0 + 1) % bw   # wraps around the antimeridian
        top = band[y0][:, xa] * (1 - fx) + band[y0][:, xb] * fx
        bot = band[y0 + 1][:, xa] * (1 - fx) + band[y0 + 1][:, xb] * fx
        grid[rows] = top * (1 - fy) + bot * fy
        print(f"grid rows {rows[-1] + 1}/{H}", end="\r", flush=True)
    print()
    return grid


def mask(feature_file, W, H):
    """Natural Earth polygons rasterised on the plate carree grid (float 0..1, 2x supersampled)."""
    ss = 2
    img = Image.new("L", (W * ss, H * ss), 0)
    draw = ImageDraw.Draw(img)
    for f in load_features(feature_file):
        for poly in geom_parts(f["geometry"]):
            for k, ring in enumerate(poly):
                pts = [((c[0] + 180) / RES * ss, (GRID_N - c[1]) / RES * ss) for c in ring]
                if len(pts) >= 3:
                    draw.polygon(pts, fill=0 if k else 255)
    return img.resize((W, H), Image.BILINEAR)


def hillshade_rows(elev, lat_rows):
    """Same lighting as build_terrain.hillshade, with the x cell shrinking with latitude."""
    gy = np.gradient(elev * ZFAC, axis=0) / CELL_M
    gx = np.gradient(elev * ZFAC, axis=1) / (CELL_M * np.maximum(np.cos(np.radians(lat_rows)), 0.05))[:, None]
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    shade = np.zeros_like(elev)
    for az, wgt in ((315, 0.55), (270, 0.2), (360, 0.15), (225, 0.1)):
        a = math.radians(360 - az + 90)
        alt = math.radians(45)
        shade += wgt * (np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(a - aspect))
    return np.clip(shade, 0, 1)


def colour(grid):
    H, W = grid.shape
    land = np.asarray(mask("ne_10m_land.geojson", W, H))
    lakes = np.asarray(mask("ne_10m_lakes.geojson", W, H))
    # bathymetry is only context: strongly smoothed, from a 1/8 grid
    f = 8
    sea = np.minimum(grid[:H // f * f, :W // f * f], 0).reshape(H // f, f, W // f, f).mean(axis=(1, 3))
    sea = np.asarray(Image.fromarray(sea.astype(np.float32), "F").resize((W, H), Image.BILINEAR))
    rgb = np.zeros((H, W, 3), dtype=np.uint8)
    lake_rgb = np.array(LAKE, dtype=np.float64)
    step = 400
    for r0 in range(0, H, step):
        r1 = min(H, r0 + step)
        a0, a1 = max(0, r0 - 1), min(H, r1 + 1)   # one row of overlap for the gradient
        e = grid[a0:a1].astype(np.float64)
        lat_rows = GRID_N - (np.arange(a0, a1) + 0.5) * RES
        shade = hillshade_rows(e, lat_rows)[r0 - a0:r0 - a0 + (r1 - r0)]
        e = e[r0 - a0:r0 - a0 + (r1 - r0)]
        land_rgb = ramp(e, LAND_RAMP) * (0.62 + 0.55 * shade)[..., None]
        sea_rgb = ramp(sea[r0:r1], SEA_RAMP) * 0.97
        lm = (land[r0:r1] / 255.0)[..., None]
        km = (lakes[r0:r1] / 255.0)[..., None]
        c = land_rgb * lm + sea_rgb * (1 - lm)
        c = c * (1 - km) + lake_rgb * km
        rgb[r0:r1] = np.clip(c, 0, 255).astype(np.uint8)
        print(f"colour rows {r1}/{H}", end="\r", flush=True)
    print()
    return rgb


def main():
    Image.MAX_IMAGE_PIXELS = None
    src = colour(elevation_grid())
    sh, sw = src.shape[:2]

    x_max = ee_forward(180, 0)[0] * K
    y_top = -ee_forward(0, LAT_TOP)[1] * K
    y_bottom = -ee_forward(0, LAT_BOTTOM)[1] * K
    extent = {"x0": -x_max, "y0": y_top, "x1": x_max, "y1": y_bottom}

    # render the most detailed level, strip by strip (bilinear sampling)
    W = LEVEL_WIDTHS[-1]
    scale = W / (2 * x_max)
    H = int(round((y_bottom - y_top) * scale))
    full = np.zeros((H, W, 4), dtype=np.uint8)
    xs = (np.arange(W) + 0.5) / scale - x_max
    for r0 in range(0, H, 256):
        r1 = min(H, r0 + 256)
        ys = (np.arange(r0, r1) + 0.5) / scale + y_top
        gx, gy = np.meshgrid(xs / K, -ys / K)
        lon, lat, valid = ee_inverse(gx, gy)
        u = (lon + 180) / RES - 0.5
        v = (GRID_N - lat) / RES - 0.5
        u0 = np.floor(u).astype(int)
        v0 = np.floor(v).astype(int)
        fu = (u - u0)[..., None]
        fv = (v - v0)[..., None]
        u0c, u1c = np.clip(u0, 0, sw - 1), np.clip(u0 + 1, 0, sw - 1)
        v0c, v1c = np.clip(v0, 0, sh - 1), np.clip(v0 + 1, 0, sh - 1)
        c = (src[v0c, u0c] * (1 - fu) * (1 - fv) + src[v0c, u1c] * fu * (1 - fv)
             + src[v1c, u0c] * (1 - fu) * fv + src[v1c, u1c] * fu * fv)
        full[r0:r1, :, :3] = np.clip(c, 0, 255).astype(np.uint8)
        full[r0:r1, :, 3] = np.where(valid, 255, 0)
        print(f"reproject rows {r1}/{H}", end="\r", flush=True)
    print()
    del src

    big = Image.fromarray(full, "RGBA")
    manifest = {"source": "AWS Terrain Tiles (Terrarium, z6) + Natural Earth 1:10m", "tile": TILE,
                "extent": extent, "levels": []}
    for li, w in enumerate(LEVEL_WIDTHS):
        h = int(round(H * w / W))
        img = big if w == W else big.resize((w, h), Image.LANCZOS)
        cols, rows = math.ceil(w / TILE), math.ceil(h / TILE)
        tiles = []
        d = os.path.join(OUT, str(li))
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
        for r in range(rows):
            for c in range(cols):
                t = img.crop((c * TILE, r * TILE, min(w, (c + 1) * TILE), min(h, (r + 1) * TILE)))
                alpha = np.asarray(t)[:, :, 3]
                if alpha.max() == 0:
                    continue
                if alpha.min() == 255:
                    t = t.convert("RGB")
                t.save(os.path.join(d, f"{c}_{r}.webp"), "WEBP", quality=80, method=6)
                tiles.append(f"{c}_{r}")
        manifest["levels"].append({"w": w, "h": h, "cols": cols, "rows": rows, "tiles": tiles})
        size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
        print(f"level {li}: {w}x{h}, {len(tiles)} tiles, {size // 1024} KB")
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
