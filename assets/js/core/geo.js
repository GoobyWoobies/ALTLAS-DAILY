// Geographic calculations. Pure functions, unit-tested in tests/.
export const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dp = p2 - p1;
  const dl = (lon2 - lon1) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from point 1 to point 2, degrees clockwise from north. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

const COMPASS_FR = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const COMPASS_FR_LONG = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
export function compassIndex(deg) {
  return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
}
export function compassFr(deg) {
  return COMPASS_FR[compassIndex(deg)];
}
export function compassFrLong(deg) {
  return COMPASS_FR_LONG[compassIndex(deg)];
}

// ---- Equal Earth projection (Šavrič, Patterson & Jenny, 2018) ----
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

/** lon/lat degrees -> [x, y] in projection units (y up). */
export function equalEarth(lon, lat) {
  const l = lon * RAD;
  const theta = Math.asin(M * Math.sin(lat * RAD));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const x = (l * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

/** Inverse of equalEarth. Returns [lon, lat] or null outside the map. */
export function equalEarthInverse(x, y) {
  let theta = y;
  let fp = A1;
  for (let i = 0; i < 20; i++) {
    const t2 = theta * theta;
    const t6 = t2 * t2 * t2;
    const f = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y;
    fp = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2);
    const d = f / fp;
    theta -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  fp = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2);
  const s = Math.sin(theta) / M;
  if (Math.abs(s) > 1) return null;
  const lon = ((M * x * fp) / Math.cos(theta)) / RAD;
  const lat = Math.asin(s) / RAD;
  if (!Number.isFinite(lon) || Math.abs(lon) > 180 + 1e-9) return null;
  return [lon, lat];
}

// ---- Polygons. Rings are flat arrays [lon0, lat0, lon1, lat1, ...]. ----

export function pointInRing(lon, lat, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i];
    const yi = ring[2 * i + 1];
    const xj = ring[2 * j];
    const yj = ring[2 * j + 1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** polygon = [outerRing, ...holes] */
export function pointInPolygon(lon, lat, polygon) {
  if (!pointInRing(lon, lat, polygon[0])) return false;
  for (let k = 1; k < polygon.length; k++) {
    if (pointInRing(lon, lat, polygon[k])) return false;
  }
  return true;
}

/**
 * Distance (km) from a point to a country given as a list of polygons.
 * 0 inside; otherwise the great-circle distance to the nearest boundary,
 * measured to the nearest point on each edge (edges are short, so the
 * edge is treated as straight in a local equirectangular frame).
 */
export function distanceToPolygonsKm(lat, lon, polygons) {
  if (!polygons?.length) return Infinity; // no outline: callers must not offer such a country
  for (const poly of polygons) {
    if (pointInPolygon(lon, lat, poly)) return 0;
  }
  let best = Infinity;
  const kx = Math.cos(lat * RAD);
  for (const poly of polygons) {
    const ring = poly[0];
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = wrapLon(ring[2 * i] - lon) * kx;
      const ay = ring[2 * i + 1] - lat;
      const bx = wrapLon(ring[2 * j] - lon) * kx;
      const by = ring[2 * j + 1] - lat;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qLon = ring[2 * i] + t * wrapLon(ring[2 * j] - ring[2 * i]);
      const qLat = ay + lat + t * dy;
      const d = haversineKm(lat, lon, qLat, qLon);
      if (d < best) best = d;
    }
  }
  return best;
}

function wrapLon(d) {
  if (d > 180) return d - 360;
  if (d < -180) return d + 360;
  return d;
}

/** bbox = [west, south, east, north]. 0 inside, else distance to the nearest box point. */
export function distanceToBBoxKm(lat, lon, bbox) {
  const [w, s, e, n] = bbox;
  if (lat >= s && lat <= n && lon >= w && lon <= e) return 0;
  const cLat = Math.max(s, Math.min(n, lat));
  // nearest longitude on the box edge, taking the short way around
  const toW = Math.abs(wrapLon(w - lon));
  const toE = Math.abs(wrapLon(e - lon));
  const cLon = lon >= w && lon <= e ? lon : toW < toE ? w : e;
  let best = haversineKm(lat, lon, cLat, cLon);
  // on a sphere the closest point of a lat/lon box edge is not always the clamped
  // latitude, so also sample along the nearest meridian edge
  for (let i = 0; i <= 20; i++) {
    const la = s + ((n - s) * i) / 20;
    best = Math.min(best, haversineKm(lat, lon, la, cLon));
  }
  return best;
}
