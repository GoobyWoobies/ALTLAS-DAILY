"""Small geometry helpers shared by the build scripts (no third-party GIS deps)."""
import math

R_EARTH = 6371.0088  # mean Earth radius, km


def simplify(points, tol):
    """Douglas-Peucker simplification of a list of (x, y) tuples (iterative)."""
    n = len(points)
    if n < 4 or tol <= 0:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    tol2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = max(0.0, min(1.0, t))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best, idx = d2, i
        if best > tol2 and idx > 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tol):
    """Simplify a closed ring; split it in two halves so the closing point is stable."""
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 8:
        return ring
    half = len(ring) // 2
    a = simplify(ring[: half + 1], tol)
    b = simplify(ring[half:] + [ring[0]], tol)
    return a[:-1] + b[:-1]


def ring_area(ring):
    """Signed planar area (shoelace)."""
    s = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def ring_centroid(ring):
    a = ring_area(ring)
    if a == 0:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    cx = cy = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        f = x1 * y2 - x2 * y1
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    return cx / (6 * a), cy / (6 * a)


def wrap_lon(lon, lon0):
    d = lon - lon0
    while d > 180:
        d -= 360
    while d < -180:
        d += 360
    return lon0 + d


def local_km(lon, lat, lon0, lat0):
    """Local equirectangular projection to km (good enough for areas/gaps of one country)."""
    k = math.pi / 180 * R_EARTH
    return (wrap_lon(lon, lon0) - lon0) * k * math.cos(math.radians(lat0)), (lat - lat0) * k


def mercator(lon, lat):
    lat = max(-85.0, min(85.0, lat))
    return math.radians(lon), math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def bbox_gap(a, b):
    """Distance between two axis-aligned boxes (0 if they overlap)."""
    dx = max(0.0, max(a[0], b[0]) - min(a[2], b[2]))
    dy = max(0.0, max(a[1], b[1]) - min(a[3], b[3]))
    return math.hypot(dx, dy)


def seg_point_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def ring_gap(r1, r2, step1=1, step2=1):
    """Approximate minimal distance between two rings (vertex-to-segment, both ways)."""
    best = float("inf")
    for (a, b, s) in ((r1, r2, step1), (r2, r1, step2)):
        for i in range(0, len(a), s):
            px, py = a[i]
            for j in range(len(b)):
                ax, ay = b[j]
                bx, by = b[(j + 1) % len(b)]
                d = seg_point_dist(px, py, ax, ay, bx, by)
                if d < best:
                    best = d
    return best


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(min(1.0, math.sqrt(h)))
