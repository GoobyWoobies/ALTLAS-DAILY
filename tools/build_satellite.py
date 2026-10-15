"""Build the satellite background of the world map (data/satellite/).

Source: NASA Blue Marble Next Generation, July 2004, true colour, 21600 x 10800
(public domain, NASA Earth Observatory / Visible Earth), downloaded once:
  https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74092/world.200407.3x21600x10800.jpg
into tools/raw/bluemarble/.

The image is reprojected from plate carree to the Equal Earth projection used
by the in-game world map (same extent: latitudes -58..84, SVG units = projection
units x 100), then cut into 512 px WebP tiles at 4 zoom levels. Pixels outside
the projection outline are transparent; fully empty tiles are not written.

Run:  python tools/build_satellite.py
"""
import json
import math
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "raw", "bluemarble", "world.200407.3x21600x10800.jpg")
OUT = os.path.join(HERE, "..", "data", "satellite")

K = 100.0          # same scale as assets/js/ui/worldMap.js
LAT_TOP = 84.0
LAT_BOTTOM = -58.0
TILE = 512
LEVEL_WIDTHS = [2048, 4096, 8192, 16384]

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


def main():
    Image.MAX_IMAGE_PIXELS = None
    src = np.asarray(Image.open(SRC).convert("RGB"))
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
        u = (lon + 180) / 360 * sw - 0.5
        v = (90 - lat) / 180 * sh - 0.5
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
        print(f"rows {r1}/{H}", end="\r", flush=True)
    print()

    big = Image.fromarray(full, "RGBA")
    manifest = {"source": "NASA Blue Marble Next Generation, July 2004", "tile": TILE,
                "extent": extent, "levels": []}
    for li, w in enumerate(LEVEL_WIDTHS):
        h = int(round(H * w / W))
        img = big if w == W else big.resize((w, h), Image.LANCZOS)
        cols, rows = math.ceil(w / TILE), math.ceil(h / TILE)
        tiles = []
        d = os.path.join(OUT, str(li))
        os.makedirs(d, exist_ok=True)
        for r in range(rows):
            for c in range(cols):
                t = img.crop((c * TILE, r * TILE, min(w, (c + 1) * TILE), min(h, (r + 1) * TILE)))
                alpha = np.asarray(t)[:, :, 3]
                if alpha.max() == 0:
                    continue
                if alpha.min() == 255:
                    t = t.convert("RGB")
                t.save(os.path.join(d, f"{c}_{r}.webp"), "WEBP", quality=78, method=6)
                tiles.append(f"{c}_{r}")
        manifest["levels"].append({"w": w, "h": h, "cols": cols, "rows": rows, "tiles": tiles})
        size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
        print(f"level {li}: {w}x{h}, {len(tiles)} tiles, {size // 1024} KB")
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
